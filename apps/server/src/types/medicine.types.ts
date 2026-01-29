import type { BaseAgentState } from "./agent.types";

/**
 * Pharmacy availability status
 */
export type PharmacyAvailability = "available" | "unavailable" | "unknown";

/**
 * Call result status
 */
export type CallStatus = "success" | "no_answer" | "not_available" | "busy";

/**
 * Location with coordinates and address
 */
export interface Location {
  lat: number;
  lng: number;
  address: string;
  city?: string;
  state?: string;
  country?: string;
}

/**
 * Pharmacy search result
 */
export interface PharmacyResult {
  id: string;
  name: string;
  address: string;
  phone: string;
  distance: number; // meters
  availability: PharmacyAvailability;
  price?: number;
  openNow?: boolean;
  openingHours?: string;
  rating?: number;
}

/**
 * Result from a simulated pharmacy call
 */
export interface CallResult {
  pharmacyId: string;
  pharmacyName: string;
  status: CallStatus;
  availability: PharmacyAvailability;
  price?: number;
  quantity?: number;
  notes: string;
  transcript?: string;
  timestamp: Date;
}

/**
 * Medicine search preferences
 */
export interface MedicinePreferences {
  brandPreference?: string;
  genericOk?: boolean;
  maxPrice?: number;
  urgency?: "immediate" | "today" | "this_week";
  quantity?: number;
}

/**
 * Medicine agent state extending base state
 */
export interface MedicineAgentState extends BaseAgentState {
  // Medicine being searched
  medicineName: string | null;
  medicineAlternatives?: string[];

  // User location
  location: Location | null;

  // Search parameters
  searchRadius: number; // meters
  preferences: MedicinePreferences;

  // Search results
  pharmacies: PharmacyResult[];

  // Call results
  callResults: CallResult[];

  // Final selection
  selectedPharmacy: PharmacyResult | null;
}

/**
 * Medicine search gathered info structure
 */
export interface MedicineGatheredInfo {
  medicineName?: string;
  location?: string;
  userAddress?: string;
  urgency?: string;
  brandPreference?: string;
  quantity?: number;
  maxPrice?: number;
}

/**
 * Medicine task result
 */
export interface MedicineTaskResult {
  medicineName: string;
  pharmaciesSearched: number;
  pharmaciesWithStock: number;
  selectedPharmacy?: PharmacyResult;
  callTranscripts: CallResult[];
  recommendations: string[];
}
