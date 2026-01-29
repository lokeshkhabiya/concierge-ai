import { HumanMessage, AIMessage, BaseMessage } from "@langchain/core/messages";
import {
  messageRepository,
  conversationRepository,
  type Message,
  type Conversation,
} from "../database";
import { logger } from "../logger";

/**
 * Chat service for managing conversations and messages
 */
export class ChatService {
  /**
   * Get or create a conversation for a session
   */
  async getOrCreateConversation(
    sessionId: string,
    conversationType: string = "chat"
  ): Promise<Conversation> {
    return conversationRepository.findOrCreate(sessionId, conversationType);
  }

  /**
   * Save a user message
   */
  async saveUserMessage(
    conversationId: string,
    content: string,
    metadata?: Record<string, unknown>
  ): Promise<Message> {
    return messageRepository.create(conversationId, "user", content, metadata);
  }

  /**
   * Save an assistant message
   */
  async saveAssistantMessage(
    conversationId: string,
    content: string,
    metadata?: Record<string, unknown>
  ): Promise<Message> {
    return messageRepository.create(
      conversationId,
      "assistant",
      content,
      metadata
    );
  }

  /**
   * Save a system message
   */
  async saveSystemMessage(
    conversationId: string,
    content: string,
    metadata?: Record<string, unknown>
  ): Promise<Message> {
    return messageRepository.create(conversationId, "system", content, metadata);
  }

  /**
   * Get conversation history
   */
  async getConversationHistory(
    conversationId: string,
    limit?: number
  ): Promise<Message[]> {
    return messageRepository.findByConversation(conversationId, limit);
  }

  /**
   * Get recent messages
   */
  async getRecentMessages(
    conversationId: string,
    limit: number = 20
  ): Promise<Message[]> {
    return messageRepository.findRecentByConversation(conversationId, limit);
  }

  /**
   * Format messages for LLM (convert to LangChain BaseMessage format)
   */
  async formatMessagesForLLM(
    conversationId: string,
    limit?: number
  ): Promise<BaseMessage[]> {
    const messages = await this.getConversationHistory(conversationId, limit);

    return messages.map((m) => {
      switch (m.role) {
        case "user":
          return new HumanMessage(m.content);
        case "assistant":
          return new AIMessage(m.content);
        default:
          return new HumanMessage(m.content);
      }
    });
  }

  /**
   * Get conversation with messages
   */
  async getConversationWithMessages(
    conversationId: string,
    messageLimit?: number
  ): Promise<{ conversation: Conversation; messages: Message[] } | null> {
    const conversation = await conversationRepository.findByIdWithMessages(
      conversationId,
      messageLimit
    );

    if (!conversation) return null;

    return {
      conversation,
      messages: conversation.messages,
    };
  }

  /**
   * Get all conversations for a session
   */
  async getSessionConversations(sessionId: string): Promise<Conversation[]> {
    return conversationRepository.findBySession(sessionId);
  }

  /**
   * Delete conversation and all messages
   */
  async deleteConversation(conversationId: string): Promise<void> {
    await conversationRepository.delete(conversationId);
    logger.info("Conversation deleted", { conversationId });
  }

  /**
   * Get message count
   */
  async getMessageCount(conversationId: string): Promise<number> {
    return messageRepository.countByConversation(conversationId);
  }

  /**
   * Save a conversation exchange (user message + assistant response)
   */
  async saveExchange(
    conversationId: string,
    userMessage: string,
    assistantMessage: string,
    metadata?: {
      userMetadata?: Record<string, unknown>;
      assistantMetadata?: Record<string, unknown>;
    }
  ): Promise<{ userMsg: Message; assistantMsg: Message }> {
    const userMsg = await this.saveUserMessage(
      conversationId,
      userMessage,
      metadata?.userMetadata
    );

    const assistantMsg = await this.saveAssistantMessage(
      conversationId,
      assistantMessage,
      metadata?.assistantMetadata
    );

    return { userMsg, assistantMsg };
  }
}

/**
 * Singleton chat service instance
 */
export const chatService = new ChatService();
