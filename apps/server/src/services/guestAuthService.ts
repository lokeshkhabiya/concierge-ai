import { userRepository, sessionRepository } from "../database";
import { logger } from "../logger";

/**
 * In-memory store for active guest sessions
 * Maps sessionToken -> { userId, sessionId, createdAt }
 */
interface GuestSessionData {
  userId: string;
  sessionId: string;
  createdAt: Date;
}

class GuestAuthService {
  private activeSessions: Map<string, GuestSessionData> = new Map();
  private readonly SESSION_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

  /**
   * Create a new guest user and session
   * Returns a session token for the CLI to use
   */
  async createGuestSession(): Promise<{
    sessionToken: string;
    userId: string;
    sessionId: string;
  }> {
    // Create guest user in database
    const user = await userRepository.createGuest();
    logger.info("Created guest user", { userId: user.id });

    // Create a session for the guest
    const session = await sessionRepository.create(user.id, "guest_chat");
    logger.info("Created guest session", { sessionId: session.id, userId: user.id });

    // Generate session token for CLI
    const sessionToken = this.generateSessionToken();

    // Store in memory
    this.activeSessions.set(sessionToken, {
      userId: user.id,
      sessionId: session.id,
      createdAt: new Date(),
    });

    return {
      sessionToken,
      userId: user.id,
      sessionId: session.id,
    };
  }

  /**
   * Validate a session token and return the associated user/session IDs
   */
  async validateSession(sessionToken: string): Promise<GuestSessionData | null> {
    const sessionData = this.activeSessions.get(sessionToken);

    if (!sessionData) {
      return null;
    }

    // Check if session has expired
    const age = Date.now() - sessionData.createdAt.getTime();
    if (age > this.SESSION_TTL_MS) {
      await this.endSession(sessionToken);
      return null;
    }

    // Verify user still exists in database
    const userExists = await userRepository.exists(sessionData.userId);
    if (!userExists) {
      this.activeSessions.delete(sessionToken);
      return null;
    }

    return sessionData;
  }

  /**
   * Get or create guest session for a request
   * If userId is provided and valid, use it
   * Otherwise create a new guest session
   */
  async getOrCreateGuestSession(
    userId?: string,
    sessionToken?: string
  ): Promise<{
    userId: string;
    sessionId: string;
    sessionToken: string;
    isNewSession: boolean;
  }> {
    // Try to use existing session token
    if (sessionToken) {
      const existingSession = await this.validateSession(sessionToken);
      if (existingSession) {
        return {
          ...existingSession,
          sessionToken,
          isNewSession: false,
        };
      }
    }

    // Try to use existing userId if valid
    if (userId) {
      const userExists = await userRepository.exists(userId);
      if (userExists) {
        // Get or create session for existing user
        const session = await sessionRepository.findLatestActiveByUser(userId);
        if (session) {
          const token = this.generateSessionToken();
          this.activeSessions.set(token, {
            userId,
            sessionId: session.id,
            createdAt: new Date(),
          });
          return {
            userId,
            sessionId: session.id,
            sessionToken: token,
            isNewSession: false,
          };
        }
      }
    }

    // Create new guest session
    const newSession = await this.createGuestSession();
    return {
      ...newSession,
      isNewSession: true,
    };
  }

  /**
   * End a guest session and optionally clean up the guest user
   */
  async endSession(sessionToken: string, deleteUser: boolean = false): Promise<void> {
    const sessionData = this.activeSessions.get(sessionToken);

    if (!sessionData) {
      return;
    }

    try {
      // End the database session
      await sessionRepository.end(sessionData.sessionId);
      logger.info("Ended guest session", { sessionId: sessionData.sessionId });

      // Optionally delete the guest user
      if (deleteUser) {
        await userRepository.deleteGuest(sessionData.userId);
        logger.info("Deleted guest user", { userId: sessionData.userId });
      }
    } catch (error) {
      logger.error("Error ending guest session", error as Error, {
        sessionId: sessionData.sessionId,
      });
    }

    // Remove from memory
    this.activeSessions.delete(sessionToken);
  }

  /**
   * Get session info without validation (for status checks)
   */
  getSessionInfo(sessionToken: string): GuestSessionData | null {
    return this.activeSessions.get(sessionToken) || null;
  }

  /**
   * Generate a unique session token
   */
  private generateSessionToken(): string {
    return `guest_${crypto.randomUUID()}`;
  }

  /**
   * Clean up expired sessions from memory
   */
  cleanupExpiredSessions(): number {
    const now = Date.now();
    let cleaned = 0;

    for (const [token, data] of this.activeSessions.entries()) {
      const age = now - data.createdAt.getTime();
      if (age >= this.SESSION_TTL_MS) {
        this.activeSessions.delete(token);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      logger.debug("Cleaned up expired guest sessions", { count: cleaned });
    }

    return cleaned;
  }

  /**
   * Get count of active sessions (for monitoring)
   */
  getActiveSessionCount(): number {
    return this.activeSessions.size;
  }
}

export const guestAuthService = new GuestAuthService();

// Cleanup expired sessions every 5 minutes
setInterval(() => {
  guestAuthService.cleanupExpiredSessions();
}, 5 * 60 * 1000);
