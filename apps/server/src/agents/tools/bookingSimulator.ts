import { z } from "zod";
import { BaseTool } from "./baseTool";
import { config } from "../../config";
import type { BookingStatus } from "../../types";

const bookingSimulatorSchema = z.object({
	itemType: z
		.enum(["activity", "accommodation", "transport"])
		.describe("Type of item to book"),
	itemId: z.string().describe("Unique identifier for the item"),
	itemName: z.string().describe("Name of the item to book"),
	date: z.string().optional().describe("Date of booking (ISO format)"),
	checkInDate: z.string().optional().describe("Check-in date for accommodation"),
	checkOutDate: z.string().optional().describe("Check-out date for accommodation"),
	guests: z.number().min(1).max(20).default(1).describe("Number of guests"),
	specialRequests: z.string().optional().describe("Any special requests"),
	contactEmail: z.string().email().optional().describe("Contact email"),
	contactPhone: z.string().optional().describe("Contact phone"),
});

type BookingSimulatorInput = z.infer<typeof bookingSimulatorSchema>;

interface SimulatedBookingResult {
	bookingId: string;
	confirmationNumber: string;
	itemType: string;
	itemId: string;
	itemName: string;
	status: BookingStatus;
	date?: string;
	checkInDate?: string;
	checkOutDate?: string;
	guests: number;
	specialRequests?: string;
	totalCost: number;
	currency: string;
	cancellationPolicy: string;
	confirmationDetails: string;
	timestamp: string;
}

export class BookingSimulatorTool extends BaseTool<typeof bookingSimulatorSchema> {
	name = "book_activity";
	description =
		"Simulate booking travel activities, accommodations, or transportation. Returns simulated confirmation.";
	schema = bookingSimulatorSchema;

	protected async execute(input: BookingSimulatorInput): Promise<string> {
		await this.simulateBookingDelay();

		const result = this.generateBookingResult(input);

		return this.success(result);
	}

	private async simulateBookingDelay(): Promise<void> {
		const delay = Math.random() * 1000 + 500;
		await new Promise((resolve) => setTimeout(resolve, delay));
	}

	private generateBookingResult(input: BookingSimulatorInput): SimulatedBookingResult {
		const success = Math.random() < config.tools.bookingSimulator.confirmationRate;

		const bookingId = `BK-${Date.now()}-${Math.random().toString(36).substring(2, 7).toUpperCase()}`;
		const confirmationNumber = success
			? this.generateConfirmationNumber()
			: "";

		const status: BookingStatus = success ? "confirmed" : "failed";
		const totalCost = this.calculateCost(input);

		return {
			bookingId,
			confirmationNumber,
			itemType: input.itemType,
			itemId: input.itemId,
			itemName: input.itemName,
			status,
			date: input.date,
			checkInDate: input.checkInDate,
			checkOutDate: input.checkOutDate,
			guests: input.guests,
			specialRequests: input.specialRequests,
			totalCost,
			currency: "INR",
			cancellationPolicy: this.getCancellationPolicy(input.itemType),
			confirmationDetails: this.generateConfirmationDetails(input, success, confirmationNumber),
			timestamp: new Date().toISOString(),
		};
	}

	private generateConfirmationNumber(): string {
		const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
		let result = "";
		for (let i = 0; i < 8; i++) {
			result += chars.charAt(Math.floor(Math.random() * chars.length));
		}
		return result;
	}

	private calculateCost(input: BookingSimulatorInput): number {
		const baseCosts: Record<string, number> = {
			activity: 50,
			accommodation: 100,
			transport: 30,
		};

		const baseCost = baseCosts[input.itemType] || 50;
		const guestMultiplier = input.itemType === "accommodation" ? 1 : input.guests;
		const variability = 0.5 + Math.random();

		let days = 1;
		if (input.checkInDate && input.checkOutDate) {
			const checkIn = new Date(input.checkInDate);
			const checkOut = new Date(input.checkOutDate);
			days = Math.max(1, Math.ceil((checkOut.getTime() - checkIn.getTime()) / (1000 * 60 * 60 * 24)));
		}

		return Math.round(baseCost * guestMultiplier * days * variability);
	}

	private getCancellationPolicy(itemType: string): string {
		const policies: Record<string, string> = {
			activity: "Free cancellation up to 24 hours before the activity. No refund for no-shows.",
			accommodation: "Free cancellation up to 48 hours before check-in. 50% refund for cancellations within 48 hours.",
			transport: "Tickets are non-refundable but can be rescheduled up to 6 hours before departure.",
		};
		return policies[itemType] || "Please contact provider for cancellation policy.";
	}

	private generateConfirmationDetails(
		input: BookingSimulatorInput,
		success: boolean,
		confirmationNumber: string
	): string {
		const lines: string[] = [
			"━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
			"[SIMULATED BOOKING CONFIRMATION]",
			"━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
			"",
		];

		if (!success) {
			lines.push(
				"⚠️ BOOKING FAILED",
				"",
				"We were unable to complete your booking at this time.",
				"This could be due to:",
				"  - Item no longer available",
				"  - Dates not available",
				"  - System temporarily unavailable",
				"",
				"Please try again or choose an alternative.",
				""
			);
		} else {
			lines.push(
				"✅ BOOKING CONFIRMED",
				"",
				`Confirmation #: ${confirmationNumber}`,
				"",
				"Booking Details:",
				`  • ${input.itemType.charAt(0).toUpperCase() + input.itemType.slice(1)}: ${input.itemName}`,
				`  • Guests: ${input.guests}`,
			);

			if (input.date) {
				lines.push(`  • Date: ${new Date(input.date).toLocaleDateString()}`);
			}
			if (input.checkInDate) {
				lines.push(`  • Check-in: ${new Date(input.checkInDate).toLocaleDateString()}`);
			}
			if (input.checkOutDate) {
				lines.push(`  • Check-out: ${new Date(input.checkOutDate).toLocaleDateString()}`);
			}
			if (input.specialRequests) {
				lines.push(`  • Special Requests: ${input.specialRequests}`);
			}

			lines.push(
				"",
				"What to bring:",
				"  • This confirmation (digital or printed)",
				"  • Valid ID",
				"  • Payment for any extras",
				""
			);
		}

		lines.push(
			"━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
			"⚠️ This is a SIMULATED booking for demonstration.",
			"No actual reservation has been made.",
			"━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
		);

		return lines.join("\n");
	}
}
