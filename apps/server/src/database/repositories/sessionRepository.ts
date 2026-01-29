import { prisma, type InputJsonValue, type Session } from "..";
import type { IntentType } from "../../types";

/**
 * Session repository for managing user sessions
 */
export const sessionRepository = {
  /**
   * Create a new session
   */
  async create(
    userId: string,
    sessionType: string,
    context?: Record<string, unknown>
  ): Promise<Session> {
    return prisma.session.create({
      data: {
        userId,
        sessionType,
        status: "active",
        context: (context ?? undefined) as InputJsonValue | undefined,
        startedAt: new Date(),
      },
    });
  },

  /**
   * Find session by ID
   */
  async findById(id: string): Promise<Session | null> {
    return prisma.session.findUnique({
      where: { id },
    });
  },

  /**
   * Find session by ID with related data
   */
  async findByIdWithRelations(id: string): Promise<Session & {
    conversations: Array<{ id: string; conversationType: string }>;
    tasks: Array<{ id: string; taskType: string; status: string }>;
  } | null> {
    return prisma.session.findUnique({
      where: { id },
      include: {
        conversations: {
          select: {
            id: true,
            conversationType: true,
          },
        },
        tasks: {
          select: {
            id: true,
            taskType: true,
            status: true,
          },
        },
      },
    });
  },

  /**
   * Find active sessions for a user
   */
  async findActiveByUser(userId: string): Promise<Session[]> {
    return prisma.session.findMany({
      where: {
        userId,
        status: "active",
      },
      orderBy: {
        createdAt: "desc",
      },
    });
  },

  /**
   * Find the most recent active session for a user
   */
  async findLatestActiveByUser(userId: string): Promise<Session | null> {
    return prisma.session.findFirst({
      where: {
        userId,
        status: "active",
      },
      orderBy: {
        createdAt: "desc",
      },
    });
  },

  /**
   * Update session status
   */
  async updateStatus(id: string, status: string): Promise<Session> {
    const updateData: { status: string; endedAt?: Date } = { status };

    if (status === "completed" || status === "failed") {
      updateData.endedAt = new Date();
    }

    return prisma.session.update({
      where: { id },
      data: updateData,
    });
  },

  /**
   * Update session context
   */
  async updateContext(
    id: string,
    context: Record<string, unknown>
  ): Promise<Session> {
    return prisma.session.update({
      where: { id },
      data: {
        context: context as InputJsonValue,
      },
    });
  },

  /**
   * Merge additional context into existing context
   */
  async mergeContext(
    id: string,
    additionalContext: Record<string, unknown>
  ): Promise<Session> {
    const session = await prisma.session.findUnique({
      where: { id },
    });

    const existingContext = (session?.context as Record<string, unknown>) || {};
    const mergedContext = { ...existingContext, ...additionalContext };

    return prisma.session.update({
      where: { id },
      data: {
        context: mergedContext as InputJsonValue,
      },
    });
  },

  /**
   * End a session
   */
  async end(id: string, status: "completed" | "failed" = "completed"): Promise<Session> {
    return prisma.session.update({
      where: { id },
      data: {
        status,
        endedAt: new Date(),
      },
    });
  },

  /**
   * Get session with current intent type from context
   */
  async getIntentType(id: string): Promise<IntentType | null> {
    const session = await prisma.session.findUnique({
      where: { id },
    });

    if (!session?.context) return null;

    const context = session.context as Record<string, unknown>;
    return (context.intentType as IntentType) || null;
  },

  /**
   * Set intent type in session context
   */
  async setIntentType(id: string, intentType: IntentType): Promise<Session> {
    return sessionRepository.mergeContext(id, { intentType });
  },
};
