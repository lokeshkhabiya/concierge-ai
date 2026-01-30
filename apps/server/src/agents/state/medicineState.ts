import { Annotation } from "@langchain/langgraph";
import { BaseAgentStateAnnotation } from "./agentState";
import type {
	Location,
	PharmacyResult,
	CallResult,
	MedicinePreferences,
} from "../../types";

export const MedicineStateAnnotation = Annotation.Root({
	...BaseAgentStateAnnotation.spec,

	medicineName: Annotation<string | null>({
		reducer: (_, next) => next,
		default: () => null,
	}),

	medicineAlternatives: Annotation<string[]>({
		reducer: (prev, next) => [...new Set([...prev, ...next])],
		default: () => [],
	}),

	location: Annotation<Location | null>({
		reducer: (_, next) => next,
		default: () => null,
	}),

	searchRadius: Annotation<number>({
		reducer: (_, next) => next,
		default: () => 5000,
	}),

	preferences: Annotation<MedicinePreferences>({
		reducer: (prev, next) => ({ ...prev, ...next }),
		default: () => ({}),
	}),

	pharmacies: Annotation<PharmacyResult[]>({
		reducer: (prev, next) => {
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

	callResults: Annotation<CallResult[]>({
		reducer: (prev, next) => {
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

	selectedPharmacy: Annotation<PharmacyResult | null>({
		reducer: (_, next) => next,
		default: () => null,
	}),
});

export type MedicineAgentState = typeof MedicineStateAnnotation.State;

export type MedicineAgentStateInput = Partial<MedicineAgentState>;

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

export function hasSufficientMedicineInfo(state: MedicineAgentState): boolean {
	return !!(state.medicineName && state.location);
}

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
