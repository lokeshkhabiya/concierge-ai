import { AIMessage } from "@langchain/core/messages";
import { toolRegistry } from "../tools";
import { logger } from "../../logger";
import type { BaseAgentState } from "../state";
import type { AgentPhase, ExecutionStep, StepStatus } from "../../types";

interface ExecutionResult {
	currentPhase?: AgentPhase;
	executionPlan?: ExecutionStep[];
	currentStepIndex?: number;
	messages?: AIMessage[];
	error?: string;
	gatheredInfo?: Record<string, unknown>;
	researchResults?: Record<string, unknown>;
}

interface ParallelStep {
  step: ExecutionStep;
  index: number;
}

interface StepRunResult {
  index: number;
  step: ExecutionStep;
  status: StepStatus;
  parsedResult?: unknown;
  errorMessage?: string;
}

const MAX_PARALLEL_WEB_SEARCH = 3;

/**
 * Create an execution node that runs tools from the plan
 */
export function createExecutionNode() {
  return async (state: BaseAgentState): Promise<ExecutionResult> => {
    const logContext = {
      sessionId: state.sessionId,
      taskId: state.taskId,
    };

    const { executionPlan, currentStepIndex } = state;

    // Check if we have a plan to execute
    if (!executionPlan || executionPlan.length === 0) {
      logger.warn("No execution plan to execute", logContext);
      return {
        currentPhase: "validation",
      };
    }

    // Check if all steps are done
    if (currentStepIndex >= executionPlan.length) {
      logger.info("All execution steps completed", logContext);
      return {
        currentPhase: "validation",
      };
    }

    const currentStep = executionPlan[currentStepIndex];
    if (!currentStep) {
      logger.warn("Current step not found", logContext);
      return {
        currentPhase: "validation",
      };
    }

    const webSearchBatch = getParallelWebSearchSteps(
      executionPlan,
      currentStepIndex,
      MAX_PARALLEL_WEB_SEARCH
    );

    if (webSearchBatch.length > 1) {
      logger.agentStep("execution: web_search (parallel)", "execution", {
        ...logContext,
        node: "web_search",
        batchSize: webSearchBatch.length,
      });
      return executeWebSearchBatch(state, executionPlan, webSearchBatch, logContext);
    }

    logger.agentStep(`execution: ${currentStep.name}`, "execution", {
      ...logContext,
      node: currentStep.toolName,
    });

    // Get the tool
    const tool = toolRegistry.getTool(currentStep.toolName);

    if (!tool) {
      logger.warn(`Tool not found: ${currentStep.toolName}`, logContext);

      // Mark step as failed and move to next
      const updatedPlan = updateStepStatus(
        executionPlan,
        currentStepIndex,
        "failed",
        { error: `Tool not found: ${currentStep.toolName}` }
      );

      return {
        executionPlan: updatedPlan,
        currentStepIndex: currentStepIndex + 1,
      };
    }

    try {
      // Mark step as in progress
      const inProgressPlan = updateStepStatus(
        executionPlan,
        currentStepIndex,
        "in_progress"
      );

      // Transform tool args to fix common mistakes
      const transformedArgs = transformToolArgs(currentStep.toolName, currentStep.toolArgs);

      // Execute the tool
      const result = await tool.invoke(transformedArgs);

      // Parse the result
      let parsedResult: unknown;
      try {
        parsedResult = JSON.parse(result);
      } catch {
        parsedResult = result;
      }

      // Check for tool-level errors
      const resultObj = parsedResult as Record<string, unknown>;
      if (resultObj.error === true || resultObj.success === false) {
        logger.warn(`Tool execution returned error: ${currentStep.toolName}`, logContext);

        const failedPlan = updateStepStatus(
          inProgressPlan,
          currentStepIndex,
          "failed",
          parsedResult
        );

        return {
          executionPlan: failedPlan,
          currentStepIndex: currentStepIndex + 1,
          messages: [
            new AIMessage(`Step "${currentStep.name}" encountered an issue. Continuing...`),
          ],
        };
      }

      // Mark step as completed with result
      const completedPlan = updateStepStatus(
        inProgressPlan,
        currentStepIndex,
        "completed",
        parsedResult
      );

      logger.info(`Step completed: ${currentStep.name}`, logContext);

      // Extract relevant info to add to gathered info (and any domain-specific
      // state like travel research results).
      const newInfo = extractInfoFromResult(state, currentStep, parsedResult);

      // Return researchResults at top level for TravelStateAnnotation reducer to accumulate
      const researchResults = newInfo.researchResults as Record<string, unknown> | undefined;

      return {
        executionPlan: completedPlan,
        currentStepIndex: currentStepIndex + 1,
        gatheredInfo: newInfo,
        researchResults, // Top-level for LangGraph reducer
        messages: [
          new AIMessage(
            `Completed: ${currentStep.name}. ${summarizeResult(currentStep.toolName, parsedResult)}`
          ),
        ],
      };
    } catch (error) {
      logger.error(`Tool execution failed: ${currentStep.toolName}`, error as Error, logContext);

      // Mark step as failed
      const failedPlan = updateStepStatus(
        executionPlan,
        currentStepIndex,
        "failed",
        { error: (error as Error).message }
      );

      return {
        executionPlan: failedPlan,
        currentStepIndex: currentStepIndex + 1,
        messages: [
          new AIMessage(`Step "${currentStep.name}" failed. Continuing with next step...`),
        ],
      };
    }
  };
}

async function executeWebSearchBatch(
  state: BaseAgentState,
  executionPlan: ExecutionStep[],
  batch: ParallelStep[],
  logContext: Record<string, unknown>
): Promise<ExecutionResult> {
  let updatedPlan = executionPlan;

  for (const entry of batch) {
    updatedPlan = updateStepStatus(updatedPlan, entry.index, "in_progress");
  }

  const results = await runWithLimit(batch, MAX_PARALLEL_WEB_SEARCH, async (entry) => {
    return executeStep(entry.step, entry.index, logContext);
  });

  const orderedResults = results.sort((a, b) => a.index - b.index);
  const completed: string[] = [];
  const failed: string[] = [];
  let gatheredInfo: Record<string, unknown> = {};
  let researchResults: Record<string, unknown> | undefined;
  let workingState = {
    ...state,
    researchResults: (state as { researchResults?: Record<string, unknown> }).researchResults,
  } as BaseAgentState;

  for (const result of orderedResults) {
    if (result.status === "completed") {
      updatedPlan = updateStepStatus(updatedPlan, result.index, "completed", result.parsedResult);
      completed.push(result.step.name);

      const info = extractInfoFromResult(workingState, result.step, result.parsedResult);
      gatheredInfo = mergeExecutionInfo(gatheredInfo, info);
      if (info.researchResults) {
        researchResults = info.researchResults as Record<string, unknown>;
        workingState = { ...workingState, researchResults } as BaseAgentState;
      }
      continue;
    }

    updatedPlan = updateStepStatus(updatedPlan, result.index, "failed", {
      error: result.errorMessage ?? "Tool execution failed",
    });
    failed.push(result.step.name);
  }

  const startIndex = batch[0]?.index ?? 0;
  const nextIndex = Math.min(startIndex + batch.length, executionPlan.length);
  const messageParts: string[] = [];
  if (completed.length > 0) {
    messageParts.push(`Completed: ${completed.join(", ")}`);
  }
  if (failed.length > 0) {
    messageParts.push(`Issues: ${failed.join(", ")}`);
  }

  return {
    executionPlan: updatedPlan,
    currentStepIndex: nextIndex,
    gatheredInfo: Object.keys(gatheredInfo).length > 0 ? gatheredInfo : undefined,
    researchResults,
    messages: messageParts.length
      ? [new AIMessage(messageParts.join(" | "))]
      : undefined,
  };
}

async function executeStep(
  step: ExecutionStep,
  index: number,
  logContext: Record<string, unknown>
): Promise<StepRunResult> {
  const tool = toolRegistry.getTool(step.toolName);
  if (!tool) {
    logger.warn(`Tool not found: ${step.toolName}`, logContext);
    return {
      index,
      step,
      status: "failed",
      errorMessage: `Tool not found: ${step.toolName}`,
    };
  }

  try {
    const transformedArgs = transformToolArgs(step.toolName, step.toolArgs);
    const result = await tool.invoke(transformedArgs);
    const parsedResult = parseToolResult(result);
    const resultObj = parsedResult as Record<string, unknown>;

    if (resultObj.error === true || resultObj.success === false) {
      logger.warn(`Tool execution returned error: ${step.toolName}`, logContext);
      return { index, step, status: "failed", parsedResult };
    }

    logger.info(`Step completed: ${step.name}`, logContext);
    return { index, step, status: "completed", parsedResult };
  } catch (error) {
    logger.error(`Tool execution failed: ${step.toolName}`, error as Error, logContext);
    return {
      index,
      step,
      status: "failed",
      errorMessage: (error as Error).message,
    };
  }
}

function parseToolResult(result: string): unknown {
  try {
    return JSON.parse(result);
  } catch {
    return result;
  }
}

function getParallelWebSearchSteps(
  plan: ExecutionStep[],
  startIndex: number,
  maxCount: number
): ParallelStep[] {
  const steps: ParallelStep[] = [];
  for (let i = startIndex; i < plan.length && steps.length < maxCount; i += 1) {
    const step = plan[i];
    if (!step || step.toolName !== "web_search") break;
    steps.push({ step, index: i });
  }
  return steps;
}

async function runWithLimit<T, R>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let nextIndex = 0;

  async function runWorker() {
    while (nextIndex < items.length) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      results[currentIndex] = await worker(items[currentIndex]!);
    }
  }

  const workerCount = Math.min(limit, items.length);
  const workers = Array.from({ length: workerCount }, () => runWorker());
  await Promise.all(workers);
  return results;
}

function mergeExecutionInfo(
  base: Record<string, unknown>,
  next: Record<string, unknown>
): Record<string, unknown> {
  const merged = { ...base };
  for (const [key, value] of Object.entries(next)) {
    if (key === "researchResults") continue;
    const existing = merged[key];
    if (Array.isArray(existing) && Array.isArray(value)) {
      merged[key] = [...existing, ...value];
      continue;
    }
    if (isPlainObject(existing) && isPlainObject(value)) {
      merged[key] = { ...existing, ...value };
      continue;
    }
    merged[key] = value;
  }
  return merged;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

/**
 * Transform tool arguments to fix common mistakes from planning phase
 */
function transformToolArgs(toolName: string, args: Record<string, unknown>): Record<string, unknown> {
	const transformed = { ...args };

	switch (toolName) {
		case "web_search": {
			// Fix invalid category values
			const category = transformed.category as string | undefined;
			if (category) {
				const validCategories = ["pharmacy", "restaurant", "hotel", "activity", "general"];
				if (!validCategories.includes(category)) {
					// Map common mistakes to valid categories
					const categoryMap: Record<string, string> = {
						transport: "general",
						transportation: "general",
						accommodation: "hotel",
						accommodations: "hotel",
						lodging: "hotel",
						dining: "restaurant",
						food: "restaurant",
						things_to_do: "activity",
						attractions: "activity",
						sightseeing: "activity",
					};
					transformed.category = categoryMap[category.toLowerCase()] || "general";
					logger.debug(`Transformed invalid category "${category}" to "${transformed.category}"`);
				}
			}
			break;
		}

		case "geocoding": {
			if (transformed.location && !transformed.address && !transformed.coordinates) {
				transformed.address = transformed.location;
				delete transformed.location;
				logger.debug("Transformed 'location' parameter to 'address' for geocoding");
			}
			if (transformed.query && !transformed.address && !transformed.coordinates) {
				transformed.address = transformed.query;
				delete transformed.query;
				logger.debug("Transformed 'query' parameter to 'address' for geocoding");
			}
			if (transformed.radius_km && typeof transformed.radius_km === "number") {
				transformed.radius = Math.round(transformed.radius_km * 1000);
				delete transformed.radius_km;
				logger.debug(`Transformed radius_km ${transformed.radius_km} to radius ${transformed.radius} meters`);
			}
			if (transformed.category && !transformed.searchType) {
				const categoryToSearchType: Record<string, string> = {
					pharmacy: "pharmacy",
					restaurant: "restaurant",
					hotel: "hotel",
					activity: "any",
					general: "any",
				};
				const mapped = categoryToSearchType[transformed.category as string];
				if (mapped) {
					transformed.searchType = mapped;
					delete transformed.category;
					logger.debug(`Transformed category "${transformed.category}" to searchType "${mapped}"`);
				}
			}
			break;
		}

		case "book_activity": {
			if (Array.isArray(transformed.services)) {
				logger.warn("book_activity received 'services' array - this format is not supported. Use individual bookings with itemType, itemId, itemName.");
				const firstService = transformed.services[0] as Record<string, unknown> | undefined;
				if (firstService) {
					transformed.itemType = firstService.serviceType || firstService.type;
					transformed.itemName = firstService.name;
					transformed.itemId = firstService.id || `item_${Date.now()}`;
					if (firstService.date) transformed.date = firstService.date;
					if (firstService.checkIn) transformed.checkInDate = firstService.checkIn;
					if (firstService.checkOut) transformed.checkOutDate = firstService.checkOut;
					if (firstService.pax || firstService.guests) {
						transformed.guests = (firstService.pax || firstService.guests) as number;
					}
					delete transformed.services;
					logger.debug("Transformed services array to individual booking format (using first service)");
				}
			}
			if (transformed.serviceType && !transformed.itemType) {
				transformed.itemType = transformed.serviceType;
				delete transformed.serviceType;
			}
			if (!transformed.itemId && transformed.itemName) {
				transformed.itemId = `item_${Date.now()}_${Math.random().toString(36).substring(7)}`;
			}
			break;
		}
	}

	return transformed;
}

function updateStepStatus(
	plan: ExecutionStep[],
	index: number,
	status: ExecutionStep["status"],
	result?: unknown
): ExecutionStep[] {
	return plan.map((step, i) => {
		if (i === index) {
			return {
				...step,
				status,
				result: result ?? step.result,
			};
		}
		return step;
	});
}

function extractInfoFromResult(
	state: BaseAgentState,
	step: ExecutionStep,
	result: unknown
): Record<string, unknown> {
	const resultObj = result as Record<string, unknown>;
	const toolName = step.toolName;

	switch (toolName) {
		case "web_search": {
			const data = resultObj.data as Record<string, unknown>;
			const results = (data?.results as unknown[]) || [];
			const category =
				(data?.category as string | undefined) ||
				((step.toolArgs as Record<string, unknown>).category as
					| string
					| undefined);

			const info: Record<string, unknown> = {};

			if (results.length > 0) {
				info.searchResults = results;
			}

			if (category && results.length > 0) {
				const currentResearch =
					((state as unknown as { researchResults?: Record<string, unknown> })
						.researchResults as Record<string, unknown> | undefined) || {};

				const updatedResearch: Record<string, unknown> = {
					...currentResearch,
				};

				const append = (key: string) => {
					const existing = (currentResearch[key] as unknown[]) || [];
					updatedResearch[key] = [...existing, ...results];
				};

				if (category === "activity") {
					append("activities");
				} else if (category === "restaurant") {
					append("restaurants");
				} else if (category === "hotel") {
					append("hotels");
				}

				info.researchResults = updatedResearch;
			}

			return info;
		}

		case "geocoding": {
			const data = resultObj.data as Record<string, unknown>;
			return {
				geocodingResult: data,
				nearbyPlaces: data?.nearbyPlaces,
			};
		}

		case "call_pharmacy": {
			const data = resultObj.data as Record<string, unknown>;
			return { callResult: data };
		}

		case "book_activity": {
			const data = resultObj.data as Record<string, unknown>;
			return { bookingResult: data };
		}

		default:
			return {};
	}
}

function summarizeResult(toolName: string, result: unknown): string {
	const resultObj = result as Record<string, unknown>;
	const data = resultObj.data as Record<string, unknown>;

	switch (toolName) {
		case "web_search": {
			const count = (data?.results as unknown[])?.length || 0;
			return `Found ${count} results.`;
		}

		case "geocoding": {
			const places = (data?.nearbyPlaces as unknown[])?.length || 0;
			return places > 0 ? `Found ${places} nearby places.` : "Location identified.";
		}

		case "call_pharmacy": {
			const status = data?.status as string;
			const availability = data?.availability as string;
			if (status === "success" && availability === "available") {
				return "Medicine is available!";
			} else if (status === "success") {
				return "Medicine not available at this pharmacy.";
			}
			return "Could not reach pharmacy.";
		}

		case "book_activity": {
			const bookingStatus = data?.status as string;
			return bookingStatus === "confirmed" ? "Booking confirmed!" : "Booking could not be completed.";
		}

		default:
			return "";
	}
}

export const executionNode = createExecutionNode();
