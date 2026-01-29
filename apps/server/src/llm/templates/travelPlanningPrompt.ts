import { ChatPromptTemplate } from "@langchain/core/prompts";

/**
 * Travel itinerary planning prompt
 * Generates an execution plan for creating a travel itinerary
 */
export const travelPlanningPrompt = ChatPromptTemplate.fromMessages([
  [
    "system",
    `You are a travel planning assistant. Create an execution plan to build a travel itinerary.

Gathered information:
{gatheredInfo}

Available tools:
{availableTools}

Your task:
Create a step-by-step execution plan using the available tools.

Plan structure (return as JSON):
{{
  "summary": "Brief description of the travel plan",
  "steps": [
    {{
      "id": "step_1",
      "name": "Research destination",
      "description": "Search for information about the destination",
      "toolName": "web_search",
      "toolArgs": {{
        "query": "things to do in [destination]",
        "category": "activity"
      }}
    }},
    // ... more steps
  ]
}}

Typical plan steps:
1. Research the destination with web_search
2. Find activities matching user interests
3. Search for accommodations using web_search
4. Find restaurants and dining options
5. Optionally book activities using booking_simulator

Important:
- Consider the travel dates and budget
- Match activities to user's interests and travel style
- Balance activities throughout the trip
- Include practical information (transportation, etc.)`,
  ],
  [
    "human",
    "Create an execution plan for a trip to {destination} from {startDate} to {endDate}",
  ],
]);

/**
 * Travel itinerary generation prompt
 * Generates a detailed day-by-day itinerary
 */
export const travelItineraryGenerationPrompt = ChatPromptTemplate.fromMessages([
  [
    "system",
    `You are an expert travel planner creating a detailed itinerary.

Destination: {destination}
Dates: {startDate} to {endDate}
Budget: {budget}
Travel style: {travelStyle}
Interests: {interests}

Research results:
{researchResults}

Create a detailed day-by-day itinerary in JSON format:
{{
  "itinerary": [
    {{
      "dayNumber": 1,
      "date": "YYYY-MM-DD",
      "theme": "Arrival and Exploration",
      "activities": [
        {{
          "id": "act_1",
          "name": "Activity name",
          "description": "What to do",
          "location": "Where",
          "duration": 120,
          "cost": 50,
          "currency": "USD",
          "category": "sightseeing",
          "bookingRequired": false,
          "tips": ["Helpful tip"]
        }}
      ],
      "meals": [
        {{
          "id": "meal_1",
          "type": "lunch",
          "restaurantName": "Restaurant",
          "cuisine": "Local",
          "location": "Address",
          "priceRange": "$$",
          "estimatedCost": 25,
          "mustTry": ["Dish name"]
        }}
      ],
      "transportation": [
        {{
          "id": "trans_1",
          "type": "taxi",
          "from": "Airport",
          "to": "Hotel",
          "duration": 30,
          "cost": 40,
          "currency": "USD"
        }}
      ],
      "estimatedCost": 200,
      "notes": ["Don't miss the sunset!"]
    }}
  ],
  "totalEstimatedCost": 1500,
  "tips": ["General trip tips"],
  "packingList": ["Essentials to bring"]
}}

Guidelines:
- Balance activities (don't overpack days)
- Match pace to travel style (relaxed vs packed)
- Stay within budget
- Include local experiences
- Add practical tips`,
  ],
  ["human", "Generate the itinerary"],
]);

/**
 * Travel itinerary refinement prompt
 * Adjusts itinerary based on user feedback
 */
export const travelRefinementPrompt = ChatPromptTemplate.fromMessages([
  [
    "system",
    `You are refining a travel itinerary based on user feedback.

Current itinerary:
{currentItinerary}

User feedback:
{feedback}

Original preferences:
{preferences}

Make adjustments to the itinerary based on the feedback:
1. If they want more/fewer activities, adjust accordingly
2. If they want different types of activities, swap them
3. If budget concerns, suggest alternatives
4. If timing issues, reorganize the schedule

Return the updated itinerary in the same JSON format.
Explain what changes you made at the start of your response.`,
  ],
  ["human", "Refine the itinerary based on: {feedback}"],
]);

/**
 * Travel validation prompt
 * Validates the itinerary before presenting
 */
export const travelValidationPrompt = ChatPromptTemplate.fromMessages([
  [
    "system",
    `You are validating a travel itinerary.

Itinerary:
{executionPlan}

Gathered information:
{gatheredInfo}

Validation criteria:
1. Covers all requested days
2. Activities align with stated interests
3. Budget is approximately met
4. Timing is realistic (not too packed/empty)
5. Includes meals and transportation

Respond with:
- "VALID" if the itinerary meets criteria
- "NEEDS_REFINEMENT: [specific issues]" if improvements needed`,
  ],
  ["human", "Validate the travel itinerary"],
]);

/**
 * Travel summary prompt
 * Creates a friendly summary of the trip
 */
export const travelSummaryPrompt = ChatPromptTemplate.fromMessages([
  [
    "system",
    `Create an engaging summary of this travel itinerary.

Itinerary:
{itinerary}

Trip details:
- Destination: {destination}
- Dates: {dates}
- Duration: {duration} days
- Budget: {budget}

Create a warm, exciting summary that:
1. Highlights the best experiences
2. Mentions total estimated cost
3. Notes any bookings made (simulated)
4. Includes 2-3 top tips
5. Ends with an encouraging note about the trip

Keep it concise (2-3 paragraphs) but engaging.`,
  ],
  ["human", "Summarize this trip"],
]);
