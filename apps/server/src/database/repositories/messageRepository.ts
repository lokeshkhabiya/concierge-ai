import type { Prisma } from "@pokus/db";
import { prisma, type Message, type Conversation } from "..";

/**
 * Message repository for managing conversation messages
 */
export const messageRepository = {
  /**
   * Create a new message
   */
  async create(
    conversationId: string,
    role: string,
    content: string,
    metadata?: Record<string, unknown>
  ): Promise<Message> {
    // Get next sequence number
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

  /**
   * Find message by ID
   */
  async findById(id: string): Promise<Message | null> {
    return prisma.message.findUnique({
      where: { id },
    });
  },

  /**
   * Find messages by conversation
   */
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

  /**
   * Find recent messages by conversation
   */
  async findRecentByConversation(
    conversationId: string,
    limit: number = 20
  ): Promise<Message[]> {
    const messages = await prisma.message.findMany({
      where: { conversationId },
      orderBy: { sequenceNumber: "desc" },
      take: limit,
    });

    // Return in ascending order
    return messages.reverse();
  },

  /**
   * Get next sequence number for a conversation
   */
  async getNextSequenceNumber(conversationId: string): Promise<number> {
    const lastMessage = await prisma.message.findFirst({
      where: { conversationId },
      orderBy: { sequenceNumber: "desc" },
      select: { sequenceNumber: true },
    });

    return (lastMessage?.sequenceNumber ?? 0) + 1;
  },

  /**
   * Count messages in a conversation
   */
  async countByConversation(conversationId: string): Promise<number> {
    return prisma.message.count({
      where: { conversationId },
    });
  },

  /**
   * Delete messages by conversation
   */
  async deleteByConversation(conversationId: string): Promise<number> {
    const result = await prisma.message.deleteMany({
      where: { conversationId },
    });
    return result.count;
  },
};

/**
 * Conversation repository for managing conversations
 */
export const conversationRepository = {
  /**
   * Create a new conversation
   */
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

  /**
   * Find conversation by ID
   */
  async findById(id: string): Promise<Conversation | null> {
    return prisma.conversation.findUnique({
      where: { id },
    });
  },

  /**
   * Find conversation by ID with messages
   */
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

  /**
   * Find conversations by session
   */
  async findBySession(sessionId: string): Promise<Conversation[]> {
    return prisma.conversation.findMany({
      where: { sessionId },
      orderBy: { createdAt: "desc" },
    });
  },

  /**
   * Find or create conversation for session and type
   */
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

  /**
   * Update conversation metadata
   */
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

  /**
   * Delete conversation and its messages
   */
  async delete(id: string): Promise<Conversation> {
    // Messages will be cascade deleted due to schema
    return prisma.conversation.delete({
      where: { id },
    });
  },
};
