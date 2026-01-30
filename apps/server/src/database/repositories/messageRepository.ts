import type { Prisma } from "@pokus/db";
import { prisma, type Message, type Conversation } from "..";

export const messageRepository = {
	async create(
		conversationId: string,
		role: string,
		content: string,
		metadata?: Record<string, unknown>
	): Promise<Message> {
		const sequenceNumber = await messageRepository.getNextSequenceNumber(conversationId);

		return prisma.message.create({
			data: {
				conversationId,
				role,
				content,
				metadata: metadata as Prisma.InputJsonValue | undefined,
				sequenceNumber,
			},
		});
	},

	async findById(id: string): Promise<Message | null> {
		return prisma.message.findUnique({
			where: { id },
		});
	},

	async findByConversation(
		conversationId: string,
		limit?: number
	): Promise<Message[]> {
		return prisma.message.findMany({
			where: { conversationId },
			orderBy: { sequenceNumber: "asc" },
			take: limit,
		});
	},

	async findRecentByConversation(
		conversationId: string,
		limit: number = 20
	): Promise<Message[]> {
		const messages = await prisma.message.findMany({
			where: { conversationId },
			orderBy: { sequenceNumber: "desc" },
			take: limit,
		});

		return messages.reverse();
	},

	async getNextSequenceNumber(conversationId: string): Promise<number> {
		const lastMessage = await prisma.message.findFirst({
			where: { conversationId },
			orderBy: { sequenceNumber: "desc" },
			select: { sequenceNumber: true },
		});

		return (lastMessage?.sequenceNumber ?? 0) + 1;
	},

	async countByConversation(conversationId: string): Promise<number> {
		return prisma.message.count({
			where: { conversationId },
		});
	},

	async deleteByConversation(conversationId: string): Promise<number> {
		const result = await prisma.message.deleteMany({
			where: { conversationId },
		});
		return result.count;
	},
};

export const conversationRepository = {
	async create(
		sessionId: string,
		conversationType: string,
		metadata?: Record<string, unknown>
	): Promise<Conversation> {
		return prisma.conversation.create({
			data: {
				sessionId,
				conversationType,
				metadata: metadata as Prisma.InputJsonValue | undefined,
			},
		});
	},

	async findById(id: string): Promise<Conversation | null> {
		return prisma.conversation.findUnique({
			where: { id },
		});
	},

	async findByIdWithMessages(
		id: string,
		messageLimit?: number
	): Promise<(Conversation & { messages: Message[] }) | null> {
		return prisma.conversation.findUnique({
			where: { id },
			include: {
				messages: {
					orderBy: { sequenceNumber: "asc" },
					take: messageLimit,
				},
			},
		});
	},

	async findBySession(sessionId: string): Promise<Conversation[]> {
		return prisma.conversation.findMany({
			where: { sessionId },
			orderBy: { createdAt: "desc" },
		});
	},

	async findOrCreate(
		sessionId: string,
		conversationType: string
	): Promise<Conversation> {
		const existing = await prisma.conversation.findFirst({
			where: {
				sessionId,
				conversationType,
			},
		});

		if (existing) {
			return existing;
		}

		return prisma.conversation.create({
			data: {
				sessionId,
				conversationType,
			},
		});
	},

	async updateMetadata(
		id: string,
		metadata: Record<string, unknown>
	): Promise<Conversation> {
		return prisma.conversation.update({
			where: { id },
			data: {
				metadata: metadata as Prisma.InputJsonValue,
			},
		});
	},

	async delete(id: string): Promise<Conversation> {
		return prisma.conversation.delete({
			where: { id },
		});
	},
};
