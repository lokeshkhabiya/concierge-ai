import { Annotation } from "@langchain/langgraph";
import { BaseAgentStateAnnotation } from "./agentState";
import type {
  Location,
  PharmacyResult,
  CallResult,
  MedicinePreferences,
} from "../../types";

/**
 * Medicine agent state annotation extending base state
 */
export const MedicineStateAnnotation = Annotation.Root({
  // Include all base state fields
  ...BaseAgentStateAnnotation.spec,

  // Medicine being searched
  medicineName: Annotation<string | null>({
    reducer: (_, next) => next,
    default: () => null,
  }),

  // Alternative medicine names
  medicineAlternatives: Annotation<string[]>({
    reducer: (prev, next) => [...new Set([...prev, ...next])],
    default: () => [],
  }),

  // User location
  location: Annotation<Location | null>({
    reducer: (_, next) => next,
    default: () => null,
  }),

  // Search radius in meters
  searchRadius: Annotation<number>({
    reducer: (_, next) => next,
    default: () => 5000,
  }),

  // Medicine preferences
  preferences: Annotation<MedicinePreferences>({
    reducer: (prev, next) => ({ ...prev, ...next }),
    default: () => ({}),
  }),

  // Found pharmacies (accumulates results)
  pharmacies: Annotation<PharmacyResult[]>({
    reducer: (prev, next) => {
      // Merge and deduplicate by ID
      const all = [...prev, ...next];
      const seen = new Set<string>();
      return all.filter((p) => {
        if (seen.has(p.id)) return false;
        seen.add(p.id);
        return true;
      });
    },
    default: () => [],
  }),

  // Call results (accumulates results)
  callResults: Annotation<CallResult[]>({
    reducer: (prev, next) => {
      // Merge and deduplicate by pharmacyId
      const all = [...prev, ...next];
      const seen = new Set<string>();
      return all.filter((c) => {
        if (seen.has(c.pharmacyId)) return false;
        seen.add(c.pharmacyId);
        return true;
      });
    },
    default: () => [],
  }),

  // Selected pharmacy for final recommendation
  selectedPharmacy: Annotation<PharmacyResult | null>({
    reducer: (_, next) => next,
    default: () => null,
  }),
});

/**
 * Type helper for medicine agent state
 */
export type MedicineAgentState = typeof MedicineStateAnnotation.State;

/**
 * Input type for medicine agent state
 */
export type MedicineAgentStateInput = Partial<MedicineAgentState>;

/**
 * Helper to create initial medicine state
 */
export function createInitialMedicineState(
  sessionId: string,
  taskId: string
): MedicineAgentStateInput {
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
    medicineName: null,
    medicineAlternatives: [],
    location: null,
    searchRadius: 5000,
    preferences: {},
    pharmacies: [],
    callResults: [],
    selectedPharmacy: null,
  };
}

/**
 * Check if medicine state has sufficient info to proceed
 */
export function hasSufficientMedicineInfo(state: MedicineAgentState): boolean {
  return !!(state.medicineName && state.location);
}

/**
 * Get missing required fields for medicine search
 */
export function getMissingMedicineFields(
  state: MedicineAgentState
): string[] {
  const missing: string[] = [];

  if (!state.medicineName) {
    missing.push("medicineName");
  }
  if (!state.location) {
    missing.push("location");
  }

  return missing;
}
