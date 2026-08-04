import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

const householdId = process.env.DEFAULT_HOUSEHOLD_ID
  ?? "00000000-0000-4000-8000-000000000001";
const systemCategoryId = "00000000-0000-4000-8000-000000000002";
const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL is required to seed the database.");
}

const prisma = new PrismaClient({ adapter: new PrismaPg(connectionString) });

await prisma.household.upsert({
  where: { id: householdId },
  update: {},
  create: { id: householdId, name: "わが家" },
});

await prisma.$transaction(async (tx) => {
  await tx.$queryRaw`
    SELECT id FROM households
    WHERE id = CAST(${householdId} AS uuid)
    FOR UPDATE
  `;
  const existing = await tx.category.findFirst({
    where: { householdId, isSystem: true, deletedAt: null },
  });
  if (!existing) {
    await tx.category.create({
      data: {
        ...(householdId === "00000000-0000-4000-8000-000000000001"
          ? { id: systemCategoryId }
          : {}),
        householdId,
        name: "未分類",
        nameKey: "未分類",
        position: 1000,
        isSystem: true,
      },
    });
  }
});

await prisma.$disconnect();
