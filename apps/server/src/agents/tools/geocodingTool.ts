import { z } from "zod";
import { BaseTool } from "./baseTool";
import { env } from "@pokus/env/server";
import { logger } from "../../logger";

const MAPBOX_GEOCODE_BASE = "https://api.mapbox.com/search/geocode/v6";
const MAPBOX_SEARCH_BOX_BASE = "https://api.mapbox.com/search/searchbox/v1";

const geocodingSchema = z
  .object({
    address: z.string().optional().describe("Address to geocode"),
    coordinates: z
      .object({
        lat: z.number().min(-90).max(90),
        lng: z.number().min(-180).max(180),
      })
      .optional()
      .describe("Coordinates for reverse geocoding"),
    radius: z
      .number()
      .min(100)
      .max(50000)
      .default(5000)
      .describe("Search radius in meters for nearby places"),
    searchType: z
      .enum(["pharmacy", "restaurant", "hotel", "any"])
      .optional()
      .describe("Type of places to search nearby"),
  })
  .refine((data) => data.address || data.coordinates, {
    message: "Either address or coordinates must be provided",
  });

type GeocodingInput = z.infer<typeof geocodingSchema>;

interface GeocodedLocation {
  lat: number;
  lng: number;
  formattedAddress: string;
  city: string;
  state: string;
  country: string;
  postalCode?: string;
}

interface NearbyPlace {
  id: string;
  name: string;
  type: string;
  address: string;
  lat: number;
  lng: number;
  distance: number;
  phone?: string;
  openNow?: boolean;
}

/** Mapbox Search Box category IDs for searchType */
const SEARCH_TYPE_TO_CATEGORY: Record<string, string> = {
  pharmacy: "health_services",
  restaurant: "restaurant",
  hotel: "lodging",
  any: "food_and_drink",
};

export class GeocodingTool extends BaseTool<typeof geocodingSchema> {
  name = "geocoding";
  description =
    "Convert addresses to coordinates, or find nearby places like pharmacies, restaurants, hotels. Uses Mapbox for geocoding and location search.";
  schema = geocodingSchema;

  private get token(): string {
    return env.MAPBOX_ACCESS_TOKEN;
  }

  protected async execute(input: GeocodingInput): Promise<string> {
    try {
      if (input.address) {
        const location = await this.geocodeAddress(input.address);
        const nearbyPlaces = input.searchType
          ? await this.findNearbyPlaces(
              location.lat,
              location.lng,
              input.radius,
              input.searchType
            )
          : [];

        return this.success({
          type: "geocode",
          query: input.address,
          location,
          nearbyPlaces,
        });
      }

      if (input.coordinates) {
        const location = await this.reverseGeocode(
          input.coordinates.lat,
          input.coordinates.lng
        );
        const nearbyPlaces = input.searchType
          ? await this.findNearbyPlaces(
              input.coordinates.lat,
              input.coordinates.lng,
              input.radius,
              input.searchType
            )
          : [];

        return this.success({
          type: "reverse_geocode",
          coordinates: input.coordinates,
          location,
          nearbyPlaces,
        });
      }

      return this.error("Either address or coordinates must be provided");
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Geocoding request failed";
      return this.error(message, err);
    }
  }

  /**
   * Forward geocode an address using Mapbox Geocoding API v6
   */
  private async geocodeAddress(address: string): Promise<GeocodedLocation> {
    const params = new URLSearchParams({
      q: address,
      access_token: this.token,
      limit: "1",
      autocomplete: "false",
    });
    const url = `${MAPBOX_GEOCODE_BASE}/forward?${params.toString()}`;
    const res = await fetch(url);

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Mapbox forward geocode failed: ${res.status} ${body}`);
    }

    const data = (await res.json()) as {
      features?: Array<{
        geometry?: { coordinates?: [number, number] };
        properties?: {
          name?: string;
          place_formatted?: string;
          context?: {
            place?: { name?: string };
            region?: { name?: string; region_code?: string };
            country?: { name?: string; country_code?: string };
            postcode?: { name?: string };
          };
        };
      }>;
    };

    const feature = data.features?.[0];
    if (!feature?.geometry?.coordinates) {
      throw new Error(`No results for address: ${address}`);
    }

    const [lng, lat] = feature.geometry.coordinates;
    const props = feature.properties ?? {};
    const ctx = props.context ?? {};
    const place = ctx.place?.name ?? "";
    const region = ctx.region?.name ?? "";
    const country = ctx.country?.name ?? "";
    const postcode = ctx.postcode?.name;
    const name = props.name ?? "";
    const placeFormatted = props.place_formatted ?? "";

    return {
      lat,
      lng,
      formattedAddress: name ? `${name}, ${placeFormatted}` : placeFormatted || address,
      city: place || "Unknown City",
      state: region || "Unknown State",
      country: country || "Unknown Country",
      postalCode: postcode,
    };
  }

  /**
   * Reverse geocode coordinates using Mapbox Geocoding API v6
   */
  private async reverseGeocode(lat: number, lng: number): Promise<GeocodedLocation> {
    const params = new URLSearchParams({
      longitude: String(lng),
      latitude: String(lat),
      access_token: this.token,
      limit: "1",
    });
    const url = `${MAPBOX_GEOCODE_BASE}/reverse?${params.toString()}`;
    const res = await fetch(url);

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Mapbox reverse geocode failed: ${res.status} ${body}`);
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
      return {
        lat,
        lng,
        formattedAddress: `${lat.toFixed(4)}, ${lng.toFixed(4)}`,
        city: "Unknown City",
        state: "Unknown State",
        country: "Unknown Country",
      };
    }

    const [lon, latRes] = feature.geometry.coordinates;
    const props = feature.properties ?? {};
    const ctx = props.context ?? {};
    const place = ctx.place?.name ?? "Unknown City";
    const region = ctx.region?.name ?? "Unknown State";
    const country = ctx.country?.name ?? "Unknown Country";
    const postcode = ctx.postcode?.name;
    const name = props.name ?? "";
    const placeFormatted = props.place_formatted ?? "";

    return {
      lat: latRes,
      lng: lon,
      formattedAddress: name ? `${name}, ${placeFormatted}` : placeFormatted || `${lat}, ${lng}`,
      city: place,
      state: region,
      country,
      postalCode: postcode,
    };
  }

  /**
   * Calculate distance between two coordinates using Haversine formula
   */
  private calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371000; // Earth's radius in meters
    const dLat = this.toRadians(lat2 - lat1);
    const dLon = this.toRadians(lon2 - lon1);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(this.toRadians(lat1)) *
        Math.cos(this.toRadians(lat2)) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  private toRadians(degrees: number): number {
    return degrees * (Math.PI / 180);
  }

  /**
   * Find nearby POIs using Mapbox Search Box API
   * First tries category endpoint, falls back to text search if needed
   * Filters results by radius to only return places within the specified distance
   */
  private async findNearbyPlaces(
    lat: number,
    lng: number,
    radius: number,
    type: string
  ): Promise<NearbyPlace[]> {
    // Try category search first
    const category = SEARCH_TYPE_TO_CATEGORY[type] ?? "food_and_drink";
    const categoryResults = await this.searchByCategory(lat, lng, radius, category, type);
    
    // If category search returned results, use them
    if (categoryResults.length > 0) {
      return categoryResults;
    }
    
    // Fallback to text-based search
    logger.debug("Category search returned no results, trying text search", { type, category });
    const searchQueries: Record<string, string> = {
      pharmacy: "pharmacy",
      restaurant: "restaurant",
      hotel: "hotel",
      any: "store",
    };
    const query = searchQueries[type] ?? type;
    return this.searchByText(lat, lng, radius, query, type);
  }

  /**
   * Search using Mapbox Search Box API category endpoint
   */
  private async searchByCategory(
    lat: number,
    lng: number,
    radius: number,
    category: string,
    type: string
  ): Promise<NearbyPlace[]> {
    const params = new URLSearchParams({
      access_token: this.token,
      proximity: `${lng},${lat}`,
      limit: "25", // Maximum allowed by Mapbox Search Box API category endpoint
      language: "en",
    });
    const url = `${MAPBOX_SEARCH_BOX_BASE}/category/${category}?${params.toString()}`;
    
    try {
      const res = await fetch(url, {
        signal: AbortSignal.timeout(10000),
      });

      if (!res.ok) {
        const errorText = await res.text();
        logger.warn("Mapbox category search failed", {
          status: res.status,
          statusText: res.statusText,
          category,
          url: url.replace(this.token, "***"),
          error: errorText.substring(0, 200),
        });
        return [];
      }

      const data = (await res.json()) as {
        features?: Array<{
          geometry?: { coordinates?: [number, number] };
          properties?: {
            name?: string;
            address?: string;
            full_address?: string;
            place_formatted?: string;
            distance?: number;
            coordinates?: {
              longitude?: number;
              latitude?: number;
            };
          };
        }>;
      };

      const features = data.features ?? [];
      logger.debug("Mapbox category search results", {
        category,
        totalFeatures: features.length,
        lat,
        lng,
        radius,
      });

      const nearbyPlaces: NearbyPlace[] = [];
      let placeIndex = 1;

      for (const f of features) {
        // Search Box API returns coordinates in geometry.coordinates OR properties.coordinates
        let featureLat: number;
        let featureLon: number;
        
        if (f.geometry?.coordinates) {
          // Standard GeoJSON format: [longitude, latitude]
          [featureLon, featureLat] = f.geometry.coordinates;
        } else if (f.properties?.coordinates?.latitude && f.properties?.coordinates?.longitude) {
          // Search Box API also provides coordinates in properties
          featureLat = f.properties.coordinates.latitude;
          featureLon = f.properties.coordinates.longitude;
        } else {
          continue; // Skip if no coordinates
        }
        
        // Calculate exact distance using Haversine formula
        const distance = this.calculateDistance(lat, lng, featureLat, featureLon);
        
        // Only include places within the specified radius
        if (distance <= radius) {
          const props = f.properties ?? {};
          const name = props.name ?? "Unknown";
          const address = props.full_address ?? props.address ?? props.place_formatted ?? "";

          nearbyPlaces.push({
            id: `${type}_${placeIndex}`,
            name,
            type,
            address,
            lat: featureLat,
            lng: featureLon,
            distance: Math.round(distance),
          });
          placeIndex++;

          // Stop once we have enough results (limit to 10 for consistency)
          if (nearbyPlaces.length >= 10) {
            break;
          }
        }
      }

      logger.debug("Filtered nearby places by radius", {
        category,
        totalFound: nearbyPlaces.length,
        radius,
      });

      // Sort by distance (closest first)
      return nearbyPlaces.sort((a, b) => a.distance - b.distance);
    } catch (err) {
      logger.warn("Mapbox category search error", {
        error: (err as Error).message,
        category,
        lat,
        lng,
      });
      return [];
    }
  }

  private async searchByText(
    lat: number,
    lng: number,
    radius: number,
    query: string,
    type: string
  ): Promise<NearbyPlace[]> {
    // Use Search Box API forward endpoint with proximity to search for POIs
    const params = new URLSearchParams({
      access_token: this.token,
      q: query,
      proximity: `${lng},${lat}`,
      limit: "10", // Maximum allowed by Search Box API forward endpoint
      language: "en",
      types: "poi", // Points of interest - valid for Search Box API
    });
    const url = `${MAPBOX_SEARCH_BOX_BASE}/forward?${params.toString()}`;
    
    try {
      const res = await fetch(url, {
        signal: AbortSignal.timeout(10000),
      });

      if (!res.ok) {
        const errorText = await res.text();
        logger.warn("Mapbox text search failed", {
          status: res.status,
          statusText: res.statusText,
          query,
          error: errorText.substring(0, 200),
        });
        return [];
      }

      const data = (await res.json()) as {
        features?: Array<{
          geometry?: { coordinates?: [number, number] };
          properties?: {
            name?: string;
            address?: string;
            full_address?: string;
            place_formatted?: string;
            coordinates?: {
              longitude?: number;
              latitude?: number;
            };
            context?: {
              place?: { name?: string };
              region?: { name?: string };
              country?: { name?: string };
            };
          };
        }>;
      };

      const features = data.features ?? [];
      logger.debug("Mapbox text search results", {
        query,
        totalFeatures: features.length,
        lat,
        lng,
        radius,
      });

      const nearbyPlaces: NearbyPlace[] = [];
      let placeIndex = 1;

      for (const feature of features) {
        // Search Box API returns coordinates in geometry.coordinates OR properties.coordinates
        let featureLat: number;
        let featureLon: number;
        
        if (feature.geometry?.coordinates) {
          // Standard GeoJSON format: [longitude, latitude]
          [featureLon, featureLat] = feature.geometry.coordinates;
        } else if (feature.properties?.coordinates?.latitude && feature.properties?.coordinates?.longitude) {
          // Search Box API also provides coordinates in properties
          featureLat = feature.properties.coordinates.latitude;
          featureLon = feature.properties.coordinates.longitude;
        } else {
          continue; // Skip if no coordinates
        }
        
        // Calculate exact distance using Haversine formula
        const distance = this.calculateDistance(lat, lng, featureLat, featureLon);
        
        // Only include places within the specified radius
        if (distance <= radius) {
          const props = feature.properties ?? {};
          const name = props.name ?? "Unknown";
          const address = props.full_address ?? props.address ?? props.place_formatted ?? "";

          nearbyPlaces.push({
            id: `${type}_${placeIndex}`,
            name,
            type,
            address,
            lat: featureLat,
            lng: featureLon,
            distance: Math.round(distance),
          });
          placeIndex++;

          // Stop once we have enough results
          if (nearbyPlaces.length >= 10) {
            break;
          }
        }
      }

      logger.debug("Filtered nearby places by radius (text search)", {
        query,
        totalFound: nearbyPlaces.length,
        radius,
      });

      // Sort by distance (closest first)
      return nearbyPlaces.sort((a, b) => a.distance - b.distance);
    } catch (err) {
      logger.warn("Mapbox text search error", {
        error: (err as Error).message,
        query,
        lat,
        lng,
      });
      return [];
    }
  }
}
