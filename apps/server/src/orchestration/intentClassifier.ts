import { classificationLlm } from "../llm";
import { intentClassificationPrompt } from "../llm/prompts";
import { logger } from "../logger";
import type { IntentType } from "../types";

export async function classifyIntent(message: string): Promise<IntentType> {
	try {
		const response = await classificationLlm.invoke(
			await intentClassificationPrompt.formatMessages({ input: message })
		);

		const content = (response.content as string).toLowerCase().trim();

		logger.debug("Intent classification", { input: message, result: content });

		if (content.includes("medicine") || content === "medicine") {
			return "medicine";
		}

		if (content.includes("travel") || content === "travel") {
			return "travel";
		}

		return "unknown";
	} catch (error) {
		logger.error("Intent classification failed", error as Error);
		return "unknown";
	}
}

export function quickClassifyIntent(message: string): IntentType | null {
	const lowerMessage = message.toLowerCase();

	const medicineKeywords = [
		"medicine",
		"pharmacy",
		"drug",
		"medication",
		"paracetamol",
		"aspirin",
		"tablet",
		"pill",
		"prescription",
		"antibiotics",
		"pain relief",
		"cough syrup",
		"find medicine",
		"buy medicine",
		"need medicine",
	];

	const travelKeywords = [
		"travel",
		"trip",
		"itinerary",
		"vacation",
		"holiday",
		"flight",
		"hotel",
		"destination",
		"visit",
		"tour",
		"plan trip",
		"going to",
		"want to go",
		"bali",
		"paris",
		"tokyo",
		"beach",
		"adventure",
	];

	for (const keyword of medicineKeywords) {
		if (lowerMessage.includes(keyword)) {
			return "medicine";
		}
	}

	for (const keyword of travelKeywords) {
		if (lowerMessage.includes(keyword)) {
			return "travel";
		}
	}

	return null;
}

export async function hybridClassifyIntent(message: string): Promise<IntentType> {
	const quickResult = quickClassifyIntent(message);
	if (quickResult) {
		logger.debug("Quick intent classification matched", { intent: quickResult });
		return quickResult;
	}

	return classifyIntent(message);
}
