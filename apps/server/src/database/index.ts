import prisma from "@pokus/db";
import { logger } from "../logger";

export { prisma };
export type { InputJsonValue } from "@pokus/db";

export async function checkDatabaseConnection(): Promise<boolean> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch (error) {
    logger.error("Database connection check failed", error as Error);
    return false;
  }
}

export async function disconnectDatabase(): Promise<void> {
  try {
    await prisma.$disconnect();
    logger.info("Database disconnected");
  } catch (error) {
    logger.error("Error disconnecting from database", error as Error);
  }
}

type InferPrismaType<T> = NonNullable<Awaited<T>>;

export type User = InferPrismaType<ReturnType<typeof prisma.user.findFirst>>;
export type UserPreference = InferPrismaType<ReturnType<typeof prisma.userPreference.findFirst>>;
export type Session = InferPrismaType<ReturnType<typeof prisma.session.findFirst>>;
export type Conversation = InferPrismaType<ReturnType<typeof prisma.conversation.findFirst>>;
export type Message = InferPrismaType<ReturnType<typeof prisma.message.findFirst>>;
export type Task = InferPrismaType<ReturnType<typeof prisma.task.findFirst>>;
export type TaskResult = InferPrismaType<ReturnType<typeof prisma.taskResult.findFirst>>;
export type TaskStep = InferPrismaType<ReturnType<typeof prisma.taskStep.findFirst>>;

export {
  sessionRepository,
  taskRepository,
  taskStepRepository,
  messageRepository,
  conversationRepository,
} from "./repositories";
