import { ChatPromptTemplate } from "@langchain/core/prompts";

/**
 * Generic result validation prompt
 * Used when task-specific validation is not needed
 */
export const genericValidationPrompt = ChatPromptTemplate.fromMessages([
  [
    "system",
    `You are validating the results of a task execution.

Task type: {taskType}
Execution results: {executionPlan}
Gathered information: {gatheredInfo}

Validation criteria:
1. Task was attempted with the gathered information
2. Tools were executed (even if some failed)
3. Some meaningful results were obtained
4. Results can be presented to the user

Respond with:
- "VALID" if the results can be presented to the user
- "NEEDS_REFINEMENT: [specific reason]" if more work is needed
- "FAILED: [reason]" if the task cannot be completed

Be pragmatic - partial results are often better than no results.`,
  ],
  ["human", "Validate the task results"],
]);

/**
 * Tool execution validation prompt
 * Validates individual tool execution results
 */
export const toolExecutionValidationPrompt = ChatPromptTemplate.fromMessages([
  [
    "system",
    `You are validating the output of a tool execution.

Tool name: {toolName}
Tool input: {toolInput}
Tool output: {toolOutput}
Expected output type: {expectedType}

Validation criteria:
1. Output is in expected format
2. No critical errors occurred
3. Data is usable for the next steps

Respond with:
- "VALID" if the output can be used
- "RETRY" if the tool should be called again
- "SKIP" if this step should be skipped
- "FAIL: [reason]" if execution should stop

Include a brief explanation of your decision.`,
  ],
  ["human", "Validate the tool output"],
]);

/**
 * Error recovery prompt
 * Determines how to handle errors during execution
 */
export const errorRecoveryPrompt = ChatPromptTemplate.fromMessages([
  [
    "system",
    `An error occurred during task execution. Determine the best recovery action.

Task type: {taskType}
Current phase: {phase}
Error message: {error}
Steps completed: {completedSteps}
Steps remaining: {remainingSteps}

Recovery options:
1. RETRY - Try the failed step again
2. SKIP - Skip the failed step and continue
3. FALLBACK - Use alternative approach
4. ABORT - Stop execution and report to user

Consider:
- Is the error recoverable?
- Can we proceed without this step?
- Is there an alternative tool/approach?
- Have we already retried multiple times?

Respond with the action and explanation:
{{
  "action": "RETRY|SKIP|FALLBACK|ABORT",
  "reason": "Brief explanation",
  "fallbackPlan": "If FALLBACK, describe the alternative approach"
}}`,
  ],
  ["human", "Determine recovery action for this error"],
]);

/**
 * Completeness check prompt
 * Checks if all required information has been gathered
 */
export const completenessCheckPrompt = ChatPromptTemplate.fromMessages([
  [
    "system",
    `Check if all required information has been gathered for the task.

Task type: {taskType}
Gathered information: {gatheredInfo}

Required fields for medicine task:
- medicineName (required)
- location (required)

Required fields for travel task:
- destination (required)
- startDate OR numberOfDays (required)

Respond with:
{{
  "isComplete": true/false,
  "missingRequired": ["list of missing required fields"],
  "missingOptional": ["list of missing optional fields that would help"],
  "recommendation": "What to ask next if not complete"
}}`,
  ],
  ["human", "Check completeness of gathered information"],
]);

/**
 * Final response generation prompt
 * Generates the final response to present to the user
 */
export const finalResponsePrompt = ChatPromptTemplate.fromMessages([
  [
    "system",
    `Generate a final response to present task results to the user.

Task type: {taskType}
Results: {results}
User's original request: {originalRequest}

Guidelines:
1. Start with a brief summary of what was accomplished
2. Present the key results clearly
3. If there were any limitations or issues, mention them honestly
4. End with next steps or helpful suggestions
5. Keep the tone friendly and helpful

For medicine searches:
- List available pharmacies first
- Include contact details
- Note that availability should be confirmed (simulated calls)

For travel itineraries:
- Summarize the trip highlights
- Mention total estimated cost
- Note any simulated bookings
- Include top tips

Keep the response conversational but informative.`,
  ],
  ["human", "Generate the final response for the user"],
]);
