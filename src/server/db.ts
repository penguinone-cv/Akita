import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import { DEFAULT_HOUSEHOLD_ID, SYSTEM_CATEGORY_ID } from "@/server/constants";

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
  bootstrap?: Promise<void>;
};

export function getDb(): PrismaClient {
  if (globalForPrisma.prisma) {
    return globalForPrisma.prisma;
  }

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not configured.");
  }

  const prisma = new PrismaClient({ adapter: new PrismaPg(connectionString) });
  globalForPrisma.prisma = prisma;
  return prisma;
}

export async function ensureDefaultHousehold(): Promise<void> {
  if (!globalForPrisma.bootstrap) {
    globalForPrisma.bootstrap = (async () => {
      const db = getDb();
      await db.$transaction(async (tx) => {
        await tx.household.upsert({
          where: { id: DEFAULT_HOUSEHOLD_ID },
          update: {},
          create: { id: DEFAULT_HOUSEHOLD_ID, name: "わが家" },
        });
        await tx.$queryRaw`
          SELECT id FROM households
          WHERE id = CAST(${DEFAULT_HOUSEHOLD_ID} AS uuid)
          FOR UPDATE
        `;
        const existing = await tx.category.findFirst({
          where: { householdId: DEFAULT_HOUSEHOLD_ID, isSystem: true, deletedAt: null },
        });
        if (!existing) {
          await tx.category.create({
            data: {
              ...(DEFAULT_HOUSEHOLD_ID === "00000000-0000-4000-8000-000000000001"
                ? { id: SYSTEM_CATEGORY_ID }
                : {}),
              householdId: DEFAULT_HOUSEHOLD_ID,
              name: "未分類",
              nameKey: "未分類",
              position: 1000,
              isSystem: true,
            },
          });
        }
      });
    })().catch((error: unknown) => {
      globalForPrisma.bootstrap = undefined;
      throw error;
    });
  }
  await globalForPrisma.bootstrap;
}
