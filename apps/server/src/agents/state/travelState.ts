import { Annotation } from "@langchain/langgraph";
import { BaseAgentStateAnnotation } from "./agentState";
import type {
  Budget,
  TravelPreferences,
  ItineraryDay,
  BookingResult,
} from "../../types";

/**
 * Travel agent state annotation extending base state
 */
export const TravelStateAnnotation = Annotation.Root({
  // Include all base state fields
  ...BaseAgentStateAnnotation.spec,

  // Destination
  destination: Annotation<string | null>({
    reducer: (_, next) => next,
    default: () => null,
  }),

  destinationCountry: Annotation<string | null>({
    reducer: (_, next) => next,
    default: () => null,
  }),

  // Travel dates
  startDate: Annotation<Date | null>({
    reducer: (_, next) => next,
    default: () => null,
  }),

  endDate: Annotation<Date | null>({
    reducer: (_, next) => next,
    default: () => null,
  }),

  flexibleDates: Annotation<boolean>({
    reducer: (_, next) => next,
    default: () => false,
  }),

  // Budget
  budget: Annotation<Budget | null>({
    reducer: (_, next) => next,
    default: () => null,
  }),

  // Travel preferences
  preferences: Annotation<TravelPreferences>({
    reducer: (prev, next) => ({
      ...prev,
      ...next,
      travelStyle: [...new Set([...(prev.travelStyle || []), ...(next.travelStyle || [])])],
      interests: [...new Set([...(prev.interests || []), ...(next.interests || [])])],
    }),
    default: () => ({
      travelStyle: [],
      interests: [],
      pace: "moderate",
    }),
  }),

  // Number of travelers
  numberOfTravelers: Annotation<number>({
    reducer: (_, next) => next,
    default: () => 1,
  }),

  // Generated itinerary
  itinerary: Annotation<ItineraryDay[] | null>({
    reducer: (_, next) => next,
    default: () => null,
  }),

  // Bookings made (accumulates)
  bookings: Annotation<BookingResult[]>({
    reducer: (prev, next) => {
      // Merge and deduplicate by ID
      const all = [...prev, ...next];
      const seen = new Set<string>();
      return all.filter((b) => {
        if (seen.has(b.id)) return false;
        seen.add(b.id);
        return true;
      });
    },
    default: () => [],
  }),

  // User refinement state
  awaitingRefinement: Annotation<boolean>({
    reducer: (_, next) => next,
    default: () => false,
  }),

  refinementFeedback: Annotation<string | null>({
    reducer: (_, next) => next,
    default: () => null,
  }),

  // Research results from web search
  researchResults: Annotation<Record<string, unknown>>({
    reducer: (prev, next) => ({ ...prev, ...next }),
    default: () => ({}),
  }),
});

/**
 * Type helper for travel agent state
 */
export type TravelAgentState = typeof TravelStateAnnotation.State;

/**
 * Input type for travel agent state
 */
export type TravelAgentStateInput = Partial<TravelAgentState>;

/**
 * Helper to create initial travel state
 */
export function createInitialTravelState(
  sessionId: string,
  taskId: string
): TravelAgentStateInput {
  return {
    sessionId,
    taskId,
    currentPhase: "clarification",
    hasSufficientInfo: false,
    gatheredInfo: {},
    executionPlan: null,
    currentStepIndex: 0,
    error: null,
    requiresHumanInput: false,
    humanInputRequest: null,
    finalResponse: null,
    destination: null,
    destinationCountry: null,
    startDate: null,
    endDate: null,
    flexibleDates: false,
    budget: null,
    preferences: {
      travelStyle: [],
      interests: [],
      pace: "moderate",
    },
    numberOfTravelers: 1,
    itinerary: null,
    bookings: [],
    awaitingRefinement: false,
    refinementFeedback: null,
    researchResults: {},
  };
}

/**
 * Check if travel state has sufficient info to proceed
 */
export function hasSufficientTravelInfo(state: TravelAgentState): boolean {
  const hasDestination = !!state.destination;
  const hasDates = !!(state.startDate && state.endDate) ||
                   !!(state.gatheredInfo.numberOfDays);

  return hasDestination && hasDates;
}

/**
 * Get missing required fields for travel planning
 */
export function getMissingTravelFields(state: TravelAgentState): string[] {
  const missing: string[] = [];

  if (!state.destination) {
    missing.push("destination");
  }
  if (!state.startDate && !state.gatheredInfo.numberOfDays) {
    missing.push("dates");
  }

  return missing;
}

/**
 * Calculate trip duration in days
 */
export function getTripDuration(state: TravelAgentState): number {
  if (state.startDate && state.endDate) {
    const start = new Date(state.startDate);
    const end = new Date(state.endDate);
    return Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
  }

  if (state.gatheredInfo.numberOfDays) {
    return state.gatheredInfo.numberOfDays as number;
  }

  return 0;
}
