import { prisma, type User, type InputJsonValue } from "..";

/**
 * User repository for managing users including guest users
 */
export const userRepository = {
  /**
   * Create a new user
   */
  async create(
    email: string,
    name: string,
    metadata?: Record<string, unknown>
  ): Promise<User> {
    return prisma.user.create({
      data: {
        email,
        name,
        metadata: (metadata ?? undefined) as InputJsonValue | undefined,
      },
    });
  },

  /**
   * Create a guest user with auto-generated credentials
   */
  async createGuest(): Promise<User> {
    const guestId = crypto.randomUUID();
    const guestEmail = `guest_${guestId}@pokus.local`;
    const guestName = `Guest_${guestId.substring(0, 8)}`;

    return prisma.user.create({
      data: {
        email: guestEmail,
        name: guestName,
        metadata: {
          isGuest: true,
          createdAt: new Date().toISOString(),
        } as InputJsonValue,
      },
    });
  },

  /**
   * Find user by ID
   */
  async findById(id: string): Promise<User | null> {
    return prisma.user.findUnique({
      where: { id },
    });
  },

  /**
   * Find user by email
   */
  async findByEmail(email: string): Promise<User | null> {
    return prisma.user.findUnique({
      where: { email },
    });
  },

  /**
   * Check if user exists
   */
  async exists(id: string): Promise<boolean> {
    const user = await prisma.user.findUnique({
      where: { id },
      select: { id: true },
    });
    return user !== null;
  },

  /**
   * Check if user is a guest user
   */
  async isGuest(id: string): Promise<boolean> {
    const user = await prisma.user.findUnique({
      where: { id },
    });
    if (!user?.metadata) return false;
    const metadata = user.metadata as Record<string, unknown>;
    return metadata.isGuest === true;
  },

  /**
   * Update user metadata
   */
  async updateMetadata(
    id: string,
    metadata: Record<string, unknown>
  ): Promise<User> {
    const user = await prisma.user.findUnique({
      where: { id },
    });

    const existingMetadata = (user?.metadata as Record<string, unknown>) || {};
    const mergedMetadata = { ...existingMetadata, ...metadata };

    return prisma.user.update({
      where: { id },
      data: {
        metadata: mergedMetadata as InputJsonValue,
      },
    });
  },

  /**
   * Delete a guest user and all associated data (cascade)
   */
  async deleteGuest(id: string): Promise<void> {
    const user = await prisma.user.findUnique({
      where: { id },
    });

    if (!user) return;

    const metadata = user.metadata as Record<string, unknown>;
    if (metadata?.isGuest !== true) {
      throw new Error("Cannot delete non-guest user");
    }

    await prisma.user.delete({
      where: { id },
    });
  },

  /**
   * Clean up old guest users (older than specified hours)
   */
  async cleanupOldGuests(hoursOld: number = 24): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setHours(cutoffDate.getHours() - hoursOld);

    const result = await prisma.user.deleteMany({
      where: {
        createdAt: {
          lt: cutoffDate,
        },
        metadata: {
          path: ["isGuest"],
          equals: true,
        },
      },
    });

    return result.count;
  },
};
