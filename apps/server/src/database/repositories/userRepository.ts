import { prisma, type User, type InputJsonValue } from "..";

export const userRepository = {
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

	async findById(id: string): Promise<User | null> {
		return prisma.user.findUnique({
			where: { id },
		});
	},

	async findByEmail(email: string): Promise<User | null> {
		return prisma.user.findUnique({
			where: { email },
		});
	},

	async exists(id: string): Promise<boolean> {
		const user = await prisma.user.findUnique({
			where: { id },
			select: { id: true },
		});
		return user !== null;
	},

	async isGuest(id: string): Promise<boolean> {
		const user = await prisma.user.findUnique({
			where: { id },
		});
		if (!user?.metadata) return false;
		const metadata = user.metadata as Record<string, unknown>;
		return metadata.isGuest === true;
	},

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
