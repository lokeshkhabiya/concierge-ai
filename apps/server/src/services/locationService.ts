import type { Location } from "../types";
import { logger } from "../logger";
import { env } from "@pokus/env/server";

const MAPBOX_GEOCODE_BASE = "https://api.mapbox.com/search/geocode/v6";

/**
 * Reverse geocode coordinates to get full address details using Mapbox
 */
async function reverseGeocodeCoordinates(lat: number, lng: number): Promise<Location | null> {
  const token = env.MAPBOX_ACCESS_TOKEN;
  if (!token) {
    logger.warn("Mapbox token not available for reverse geocoding");
    return null;
  }

  try {
    const params = new URLSearchParams({
      longitude: String(lng),
      latitude: String(lat),
      access_token: token,
      limit: "1",
    });
    const url = `${MAPBOX_GEOCODE_BASE}/reverse?${params.toString()}`;
    const res = await fetch(url, {
      signal: AbortSignal.timeout(5000),
    });

    if (!res.ok) {
      logger.warn("Reverse geocoding failed", { status: res.status });
      return null;
    }

    const data = (await res.json()) as {
      features?: Array<{
        geometry?: { coordinates?: [number, number] };
        properties?: {
          name?: string;
          place_formatted?: string;
          context?: {
            place?: { name?: string };
            region?: { name?: string };
            country?: { name?: string };
            postcode?: { name?: string };
          };
        };
      }>;
    };

    const feature = data.features?.[0];
    if (!feature?.geometry?.coordinates) {
      return null;
    }

    const [lon, latRes] = feature.geometry.coordinates;
    const props = feature.properties ?? {};
    const ctx = props.context ?? {};
    const place = ctx.place?.name ?? "";
    const region = ctx.region?.name ?? "";
    const country = ctx.country?.name ?? "";
    const name = props.name ?? "";
    const placeFormatted = props.place_formatted ?? "";

    const formattedAddress = name ? `${name}, ${placeFormatted}` : placeFormatted || `${lat}, ${lng}`;

    return {
      lat: latRes,
      lng: lon,
      address: formattedAddress,
      city: place || undefined,
      state: region || undefined,
      country: country || undefined,
    };
  } catch (err) {
    logger.warn("Reverse geocoding failed", { error: (err as Error).message });
    return null;
  }
}

export function locationFromBrowser(params: {
  lat: number;
  lng: number;
  address?: string;
}): Location {
  const { lat, lng, address } = params;
  return {
    lat,
    lng,
    address: address ?? `${lat}, ${lng}`,
  };
}

export async function detectLocation(params?: {
  lat?: number;
  lng?: number;
  address?: string;
}): Promise<Location | null> {
  if (params?.lat != null && params?.lng != null) {
    // If address is already provided, use it directly
    if (params.address) {
      return locationFromBrowser({
        lat: params.lat,
        lng: params.lng,
        address: params.address,
      });
    }
    
    // Otherwise, reverse geocode to get exact address from coordinates
    const reverseGeocoded = await reverseGeocodeCoordinates(params.lat, params.lng);
    if (reverseGeocoded) {
      logger.info("Location reverse geocoded from coordinates", {
        lat: reverseGeocoded.lat,
        lng: reverseGeocoded.lng,
        address: reverseGeocoded.address,
      });
      return reverseGeocoded;
    }
    
    // Fallback to basic location if reverse geocoding fails
    return locationFromBrowser({
      lat: params.lat,
      lng: params.lng,
    });
  }
  
  // No coordinates provided - return null (IP-based detection removed)
  return null;
}
