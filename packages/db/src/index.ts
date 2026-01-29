import { env } from "@pokus/env/server";
import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "../prisma/generated/client";

const adapter = new PrismaPg({ connectionString: env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

export default prisma;
export { Prisma } from "../prisma/generated/client";

/** Re-export for JSON field inputs (e.g. Session.context). Use for type assertions when passing Record<string, unknown>. */
export type InputJsonValue = import("../prisma/generated/client").Prisma.InputJsonValue;
