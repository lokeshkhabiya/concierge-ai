import type { BaseAgentState } from "./agent.types";

/**
 * Travel style preferences
 */
export type TravelStyle =
  | "adventure"
  | "relaxation"
  | "cultural"
  | "luxury"
  | "budget"
  | "family"
  | "romantic"
  | "solo";

/**
 * Activity categories
 */
export type ActivityCategory =
  | "sightseeing"
  | "outdoor"
  | "food"
  | "shopping"
  | "entertainment"
  | "wellness"
  | "nightlife"
  | "cultural";

/**
 * Booking status
 */
export type BookingStatus =
  | "pending"
  | "confirmed"
  | "cancelled"
  | "failed";

/**
 * Budget range
 */
export interface Budget {
  min: number;
  max: number;
  currency: string;
}

/**
 * Travel activity
 */
export interface Activity {
  id: string;
  name: string;
  description: string;
  location: string;
  address?: string;
  duration: number; // minutes
  cost: number;
  currency: string;
  category: ActivityCategory;
  bookingRequired: boolean;
  bookingUrl?: string;
  rating?: number;
  tips?: string[];
}

/**
 * Meal suggestion
 */
export interface MealSuggestion {
  id: string;
  type: "breakfast" | "lunch" | "dinner" | "snack";
  restaurantName: string;
  cuisine: string;
  location: string;
  priceRange: string;
  estimatedCost: number;
  description?: string;
  mustTry?: string[];
}

/**
 * Accommodation suggestion
 */
export interface AccommodationSuggestion {
  id: string;
  name: string;
  type: "hotel" | "hostel" | "apartment" | "resort" | "villa";
  address: string;
  pricePerNight: number;
  currency: string;
  rating?: number;
  amenities: string[];
  bookingUrl?: string;
}

/**
 * Transportation suggestion
 */
export interface TransportSuggestion {
  id: string;
  type: "flight" | "train" | "bus" | "taxi" | "rental" | "walk" | "ferry";
  from: string;
  to: string;
  duration: number; // minutes
  cost: number;
  currency: string;
  notes?: string;
}

/**
 * Single day in the itinerary
 */
export interface ItineraryDay {
  dayNumber: number;
  date: Date;
  theme?: string;
  activities: Activity[];
  accommodation: AccommodationSuggestion | null;
  meals: MealSuggestion[];
  transportation: TransportSuggestion[];
  estimatedCost: number;
  notes?: string[];
}

/**
 * Booking result
 */
export interface BookingResult {
  id: string;
  type: "activity" | "accommodation" | "transport";
  itemId: string;
  itemName: string;
  status: BookingStatus;
  confirmationNumber?: string;
  bookingDetails: Record<string, unknown>;
  cost: number;
  currency: string;
  timestamp: Date;
}

/**
 * Travel preferences
 */
export interface TravelPreferences {
  travelStyle: TravelStyle[];
  interests: ActivityCategory[];
  pace: "relaxed" | "moderate" | "packed";
  dietaryRestrictions?: string[];
  accessibilityNeeds?: string[];
  avoidCategories?: ActivityCategory[];
}

/**
 * Travel agent state extending base state
 */
export interface TravelAgentState extends BaseAgentState {
  // Destination
  destination: string | null;
  destinationCountry?: string;

  // Travel dates
  startDate: Date | null;
  endDate: Date | null;
  flexibleDates?: boolean;

  // Budget
  budget: Budget | null;

  // Preferences
  preferences: TravelPreferences;

  // Generated itinerary
  itinerary: ItineraryDay[] | null;

  // Bookings
  bookings: BookingResult[];

  // User refinement state
  awaitingRefinement: boolean;
  refinementFeedback?: string;
}

/**
 * Travel gathered info structure
 */
export interface TravelGatheredInfo {
  destination?: string;
  startDate?: string;
  endDate?: string;
  numberOfDays?: number;
  budgetMin?: number;
  budgetMax?: number;
  currency?: string;
  travelStyle?: string[];
  interests?: string[];
  numberOfTravelers?: number;
  specialRequirements?: string;
}

/**
 * Travel task result
 */
export interface TravelTaskResult {
  destination: string;
  dates: { start: Date; end: Date };
  totalDays: number;
  itinerary: ItineraryDay[];
  estimatedTotalCost: number;
  currency: string;
  bookings: BookingResult[];
  tips: string[];
}
