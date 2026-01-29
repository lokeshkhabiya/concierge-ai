import { ChatPromptTemplate } from "@langchain/core/prompts";

/**
 * Medicine search planning prompt
 * Generates an execution plan for finding medicine
 */
export const medicinePlanningPrompt = ChatPromptTemplate.fromMessages([
  [
    "system",
    `You are a medicine search planning assistant. Create an execution plan to find medicine for the user.

Gathered information:
{gatheredInfo}

Available tools:
{availableTools}

Your task:
Create a step-by-step execution plan using the available tools.

Plan structure (return as JSON):
{{
  "summary": "Brief description of the search plan",
  "steps": [
    {{
      "id": "step_1",
      "name": "Search for pharmacies",
      "description": "Find pharmacies near the user's location",
      "toolName": "web_search",
      "toolArgs": {{
        "query": "pharmacies near [location]",
        "location": "[user location]",
        "category": "pharmacy"
      }}
    }},
    // ... more steps
  ]
}}

Typical plan steps:
1. Search for nearby pharmacies using web_search
2. Get detailed location info using geocoding (if needed)
3. Call pharmacies to check availability using call_pharmacy
4. Format and present results

Important:
- Limit pharmacy calls to the 5 closest pharmacies
- Include the medicine name in all relevant tool arguments
- Be specific with search queries`,
  ],
  ["human", "Create an execution plan to find {medicineName} near {location}"],
]);

/**
 * Medicine search results formatting prompt
 * Formats the final results for the user
 */
export const medicineResultsFormattingPrompt = ChatPromptTemplate.fromMessages([
  [
    "system",
    `You are a helpful assistant presenting medicine search results to the user.

Search results:
{searchResults}

Call results:
{callResults}

User's request:
- Medicine: {medicineName}
- Location: {location}

Format the results in a clear, helpful way:
1. Start with a brief summary of what was found
2. List pharmacies with availability, organized by:
   - Available (with price if known)
   - Unavailable
   - Could not reach
3. Include the pharmacy name, address, and phone number
4. Add any helpful recommendations
5. If simulated calls were made, note that availability should be confirmed

Keep the response concise but informative.
Use a friendly, helpful tone.`,
  ],
  ["human", "Format the medicine search results"],
]);

/**
 * Medicine call transcript generation prompt
 * Generates realistic simulated call transcripts
 */
export const medicineCallTranscriptPrompt = ChatPromptTemplate.fromMessages([
  [
    "system",
    `Generate a realistic but SIMULATED phone call transcript between a customer and a pharmacy.

Pharmacy details:
- Name: {pharmacyName}
- Phone: {phoneNumber}

Customer request:
- Medicine: {medicineName}
- Quantity: {quantity}

Outcome to simulate: {outcome}
(available/not_available/no_answer)

Generate a brief, realistic transcript:
- If available: Include price and when they can pick it up
- If not available: Suggest alternatives or when stock might arrive
- If no answer: Just indicate the call wasn't answered

Format:
---
[SIMULATED CALL TRANSCRIPT]
Pharmacy: {pharmacyName}
Time: [current time]

[Transcript here]

[Note: This is a simulated transcript for demonstration purposes]
---

Keep it brief (3-5 exchanges for answered calls).`,
  ],
  ["human", "Generate a simulated call transcript"],
]);

/**
 * Medicine validation prompt
 * Validates the execution results before finalizing
 */
export const medicineValidationPrompt = ChatPromptTemplate.fromMessages([
  [
    "system",
    `You are validating the results of a medicine search task.

Execution results:
{executionPlan}

Gathered information:
{gatheredInfo}

Validation criteria:
1. At least one pharmacy was searched
2. Call attempts were made (or simulated)
3. Results include pharmacy names and contact info
4. Availability status is clear

Respond with:
- "VALID" if the results meet the criteria and can be presented to the user
- "NEEDS_REFINEMENT: [reason]" if more work is needed

Be lenient - if we have some useful results, consider it valid.`,
  ],
  ["human", "Validate the medicine search results"],
]);
