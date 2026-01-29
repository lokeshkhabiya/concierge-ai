import { z } from "zod";
import { BaseTool } from "./baseTool";
import { config } from "../../config";
import type { CallStatus, PharmacyAvailability } from "../../types";

const callSimulatorSchema = z.object({
  pharmacyId: z.string().describe("Unique identifier for the pharmacy"),
  pharmacyName: z.string().describe("Name of the pharmacy"),
  phoneNumber: z.string().describe("Phone number to call"),
  medicineName: z.string().describe("Name of the medicine to inquire about"),
  quantity: z.number().min(1).default(1).describe("Quantity needed"),
});

type CallSimulatorInput = z.infer<typeof callSimulatorSchema>;

interface SimulatedCallResult {
  pharmacyId: string;
  pharmacyName: string;
  phoneNumber: string;
  medicineName: string;
  status: CallStatus;
  availability: PharmacyAvailability;
  price?: number;
  quantity?: number;
  estimatedPickupTime?: string;
  notes: string;
  transcript: string;
  callDuration: number; // seconds
  timestamp: string;
}

export class CallSimulatorTool extends BaseTool<typeof callSimulatorSchema> {
  name = "call_pharmacy";
  description =
    "Simulate calling a pharmacy to check medicine availability. Returns simulated call results with transcript.";
  schema = callSimulatorSchema;

  protected async execute(input: CallSimulatorInput): Promise<string> {
    await this.simulateCallDuration();

    const result = this.generateCallResult(input);

    return this.success(result);
  }

  private async simulateCallDuration(): Promise<void> {
    const { minDelayMs, maxDelayMs } = config.tools.callSimulator;
    const delay = Math.random() * (maxDelayMs - minDelayMs) + minDelayMs;
    await new Promise((resolve) => setTimeout(resolve, delay));
  }

  private generateCallResult(input: CallSimulatorInput): SimulatedCallResult {
    const random = Math.random();
    let status: CallStatus;
    let availability: PharmacyAvailability;

    if (random < 0.15) {
      // 15% chance of no answer
      status = "no_answer";
      availability = "unknown";
    } else if (random < 0.25) {
      // 10% chance of busy
      status = "busy";
      availability = "unknown";
    } else if (random < 0.45) {
      // 20% not available
      status = "success";
      availability = "unavailable";
    } else {
      // 55% available
      status = "success";
      availability = "available";
    }

    const callDuration =
      status === "no_answer" || status === "busy"
        ? Math.floor(Math.random() * 10) + 5
        : Math.floor(Math.random() * 60) + 30;

    const price =
      availability === "available" ? Math.floor(Math.random() * 300) + 50 : undefined;

    const transcript = this.generateTranscript(input, status, availability, price);

    return {
      pharmacyId: input.pharmacyId,
      pharmacyName: input.pharmacyName,
      phoneNumber: input.phoneNumber,
      medicineName: input.medicineName,
      status,
      availability,
      price,
      quantity: availability === "available" ? input.quantity : undefined,
      estimatedPickupTime:
        availability === "available" ? this.getPickupTime() : undefined,
      notes: this.getNotes(status, availability) || "",
      transcript,
      callDuration,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Generate a realistic call transcript
   */
  private generateTranscript(
    input: CallSimulatorInput,
    status: CallStatus,
    availability: PharmacyAvailability,
    price?: number
  ): string {
    const lines: string[] = [
      "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
      "[SIMULATED CALL TRANSCRIPT]",
      `Pharmacy: ${input.pharmacyName}`,
      `Phone: ${input.phoneNumber}`,
      `Time: ${new Date().toLocaleTimeString()}`,
      "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
      "",
    ];

    if (status === "no_answer") {
      lines.push(
        "*Ring... Ring... Ring...*",
        "",
        "[Call not answered after multiple attempts]",
        ""
      );
    } else if (status === "busy") {
      lines.push(
        "*Busy tone*",
        "",
        "[Line was busy, please try again later]",
        ""
      );
    } else if (availability === "available") {
      lines.push(
        "Pharmacy: Good day! Thank you for calling " + input.pharmacyName + ". How may I help you?",
        "",
        `Customer: Hi, I'm looking for ${input.medicineName}. Do you have it in stock?`,
        "",
        "Pharmacy: Let me check that for you... Yes, we do have " + input.medicineName + " available.",
        "",
        `Customer: Great! How much does it cost?`,
        "",
        `Pharmacy: The price is ₹${price} for the standard pack.`,
        "",
        `Customer: Perfect. Can I pick it up today?`,
        "",
        `Pharmacy: Absolutely! We're open until 9 PM. You can pick it up anytime.`,
        "",
        "Customer: Thank you so much!",
        "",
        "Pharmacy: You're welcome. See you soon!",
        ""
      );
    } else {
      const alternatives = [
        "We might get stock tomorrow",
        "You could try the branch on MG Road",
        "We have a similar medicine if you're interested",
      ];
      const alternative = alternatives[Math.floor(Math.random() * alternatives.length)];

      lines.push(
        "Pharmacy: Good day! Thank you for calling " + input.pharmacyName + ". How may I help you?",
        "",
        `Customer: Hi, I'm looking for ${input.medicineName}. Do you have it in stock?`,
        "",
        "Pharmacy: Let me check... I'm sorry, we're currently out of stock for " + input.medicineName + ".",
        "",
        `Customer: Oh, that's unfortunate. Any idea when you'll have it?`,
        "",
        `Pharmacy: ${alternative}.`,
        "",
        "Customer: Alright, thank you for checking.",
        "",
        "Pharmacy: Sorry we couldn't help today. Please try again later!",
        ""
      );
    }

    lines.push(
      "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
      "⚠️ This is a SIMULATED transcript for demonstration.",
      "Please confirm availability directly with the pharmacy.",
      "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    );

    return lines.join("\n");
  }

  private getPickupTime(): string {
    const now = new Date();
    const options = [
      "Ready now",
      "Ready in 15 minutes",
      "Ready in 30 minutes",
      "Ready by " + new Date(now.getTime() + 60 * 60 * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    ];
    return options[Math.floor(Math.random() * options.length)] as string;
  }

  private getNotes(status: CallStatus, availability: PharmacyAvailability): string {
    if (status === "no_answer") {
      return "Call not answered. Consider trying again later.";
    }
    if (status === "busy") {
      return "Line was busy. May be worth trying again.";
    }
    if (availability === "available") {
      return "Medicine is in stock and ready for pickup.";
    }
    return "Medicine not currently in stock. May need to try other pharmacies.";
  }
}
