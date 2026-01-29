import type { Location } from "../types";
import { logger } from "../logger";

const IP_API_BASE = "http://ip-api.com/json";

interface IpApiResponse {
  status: "success" | "fail";
  message?: string;
  city?: string;
  regionName?: string;
  country?: string;
  lat?: number;
  lon?: number;
  zip?: string;
}

function formatLocationFromAPI(data: IpApiResponse): Location | null {
  if (data.status !== "success" || data.lat == null || data.lon == null) {
    return null;
  }
  const city = data.city ?? "";
  const regionName = data.regionName ?? "";
  const country = data.country ?? "";
  const address = [city, regionName, country].filter(Boolean).join(", ") || "Unknown";
  return {
    lat: data.lat,
    lng: data.lon,
    address,
    city: city || undefined,
    state: regionName || undefined,
    country: country || undefined,
  };
}

export async function detectLocationFromIP(): Promise<Location | null> {
  try {
    const res = await fetch(`${IP_API_BASE}/?fields=status,message,city,regionName,country,lat,lon,zip`, {
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) {
      logger.warn("Location from IP failed", { status: res.status });
      return null;
    }
    const data = (await res.json()) as IpApiResponse;
    const location = formatLocationFromAPI(data);
    if (location) {
      logger.info("Location detected from IP", { city: location.city, country: location.country });
    }
    return location;
  } catch (err) {
    logger.warn("Location from IP failed", { error: (err as Error).message });
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
    return locationFromBrowser({
      lat: params.lat,
      lng: params.lng,
      address: params.address,
    });
  }
  return detectLocationFromIP();
}
