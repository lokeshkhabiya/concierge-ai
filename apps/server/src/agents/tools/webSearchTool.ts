import { z } from "zod";
import { BaseTool } from "./baseTool";
import { env } from "@pokus/env/server";

const FIRECRAWL_SEARCH_URL = "https://api.firecrawl.dev/v2/search";

const webSearchSchema = z.object({
	query: z.string().describe("The search query"),
	maxResults: z.number().min(1).max(20).default(10).describe("Maximum number of results"),
	location: z.string().optional().describe("Location context for the search"),
	category: z
		.enum(["pharmacy", "restaurant", "hotel", "activity", "general"])
		.optional()
		.describe("Category to focus the search"),
});

type WebSearchInput = z.infer<typeof webSearchSchema>;

interface SearchResult {
	id: string;
	title: string;
	description: string;
	url?: string;
	address?: string;
	phone?: string;
	rating?: number;
	distance?: number;
	priceRange?: string;
	openNow?: boolean;
	markdown?: string;
}

export class WebSearchTool extends BaseTool<typeof webSearchSchema> {
	name = "web_search";
	description =
		"Search the web for information. Use for finding pharmacies, restaurants, activities, hotels, or general information. Returns real search results with content.";
	schema = webSearchSchema;

	private get apiKey(): string {
		return env.FIRECRAWL_API_KEY;
	}

	protected async execute(input: WebSearchInput): Promise<string> {
		try {
			const results = await this.search(input);
			return this.success({
				query: input.query,
				location: input.location,
				category: input.category,
				totalResults: results.length,
				results,
			});
		} catch (err) {
			const message =
				err instanceof Error ? err.message : "Web search failed";
			return this.error(message, err);
		}
	}

	private async search(input: WebSearchInput): Promise<SearchResult[]> {
		const searchQuery = this.buildSearchQuery(input);
		const body: Record<string, unknown> = {
			query: searchQuery,
			limit: Math.min(input.maxResults, 100),
			sources: ["web"],
			timeout: 60000,
		};

		if (input.location) {
			body.location = input.location;
		}

		body.scrapeOptions = {
			formats: [{ type: "markdown" }],
		};

		const res = await fetch(FIRECRAWL_SEARCH_URL, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Authorization: `Bearer ${this.apiKey}`,
			},
			body: JSON.stringify(body),
		});

		if (!res.ok) {
			const text = await res.text();
			throw new Error(`Firecrawl search failed: ${res.status} ${text}`);
		}

		const data = (await res.json()) as {
			success?: boolean;
			data?: {
				web?: Array<{
					title?: string;
					description?: string;
					url?: string;
					markdown?: string;
				}>;
			};
		};

		if (!data.success || !data.data?.web) {
			return [];
		}

		return data.data.web.map((item, i) => ({
			id: `result_${i + 1}`,
			title: item.title ?? "Untitled",
			description: item.description ?? "",
			url: item.url,
			markdown: item.markdown,
		}));
	}

	private buildSearchQuery(input: WebSearchInput): string {
		let q = input.query;
		if (input.category && input.category !== "general") {
			q = `${input.query} ${input.category}`;
		}
		if (input.location) {
			q = `${q} ${input.location}`;
		}
		return q;
	}
}
