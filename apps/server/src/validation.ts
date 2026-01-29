import { z } from "zod";

export const chatRequestSchema = z.object({
  userId: z.string().uuid("Invalid user ID"),
  message: z.string().min(1, "Message is required").max(2000, "Message too long"),
  sessionId: z.string().uuid("Invalid session ID").optional(),
});

export type ChatRequest = z.infer<typeof chatRequestSchema>;

export const streamChatRequestSchema = chatRequestSchema.extend({
  streaming: z.literal(true),
});

export type StreamChatRequest = z.infer<typeof streamChatRequestSchema>;

export const continueTaskRequestSchema = z.object({
  taskId: z.string().uuid("Invalid task ID"),
  userInput: z.string().min(1, "Input is required"),
  selectedOption: z.string().optional(),
});

export type ContinueTaskRequest = z.infer<typeof continueTaskRequestSchema>;

export const geocodingInputSchema = z.object({
  address: z.string().min(1, "Address is required").optional(),
  coordinates: z
    .object({
      lat: z.number().min(-90).max(90),
      lng: z.number().min(-180).max(180),
    })
    .optional(),
  radius: z.number().min(100).max(50000).default(5000),
}).refine(
  (data) => data.address || data.coordinates,
  "Either address or coordinates must be provided"
);

export type GeocodingInput = z.infer<typeof geocodingInputSchema>;

export const webSearchInputSchema = z.object({
  query: z.string().min(1, "Query is required").max(500, "Query too long"),
  maxResults: z.number().min(1).max(20).default(10),
  location: z.string().optional(),
  category: z.enum(["pharmacy", "restaurant", "hotel", "activity", "general"]).optional(),
});

export type WebSearchInput = z.infer<typeof webSearchInputSchema>;

export const callSimulatorInputSchema = z.object({
  pharmacyId: z.string().min(1),
  pharmacyName: z.string().min(1),
  phoneNumber: z.string().min(1),
  medicineName: z.string().min(1),
  quantity: z.number().min(1).default(1),
});

export type CallSimulatorInput = z.infer<typeof callSimulatorInputSchema>;

export const bookingSimulatorInputSchema = z.object({
  itemType: z.enum(["activity", "accommodation", "transport"]),
  itemId: z.string().min(1),
  itemName: z.string().min(1),
  date: z.string().datetime().optional(),
  guests: z.number().min(1).max(20).default(1),
  specialRequests: z.string().optional(),
});

export type BookingSimulatorInput = z.infer<typeof bookingSimulatorInputSchema>;

export const medicineGatheredInfoSchema = z.object({
  medicineName: z.string().min(1).optional(),
  location: z.string().min(1).optional(),
  userAddress: z.string().optional(),
  urgency: z.enum(["immediate", "today", "this_week"]).optional(),
  brandPreference: z.string().optional(),
  quantity: z.number().min(1).optional(),
  maxPrice: z.number().min(0).optional(),
});

export const travelGatheredInfoSchema = z.object({
  destination: z.string().min(1).optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  numberOfDays: z.number().min(1).max(30).optional(),
  budgetMin: z.number().min(0).optional(),
  budgetMax: z.number().min(0).optional(),
  currency: z.string().length(3).optional(),
  travelStyle: z.array(z.string()).optional(),
  interests: z.array(z.string()).optional(),
  numberOfTravelers: z.number().min(1).max(20).optional(),
  specialRequirements: z.string().optional(),
});

export const apiErrorSchema = z.object({
  error: z.string(),
  code: z.string().optional(),
  details: z.unknown().optional(),
});

export type ApiError = z.infer<typeof apiErrorSchema>;

export const healthCheckSchema = z.object({
  status: z.enum(["ok", "degraded", "error"]),
  database: z.boolean(),
  timestamp: z.string().datetime(),
});

export type HealthCheck = z.infer<typeof healthCheckSchema>;

export function validateRequest<T extends z.ZodSchema>(
  schema: T,
  data: unknown
): { success: true; data: z.infer<T> } | { success: false; error: z.ZodError } {
  const result = schema.safeParse(data);
  if (result.success) {
    return { success: true, data: result.data };
  }
  return { success: false, error: result.error };
}

export function formatZodError(error: z.ZodError): ApiError {
  const issues = error.issues.map((issue) => ({
    path: issue.path.join("."),
    message: issue.message,
  }));

  return {
    error: "Validation failed",
    code: "VALIDATION_ERROR",
    details: issues,
  };
}
