import { beforeEach, describe, expect, it, vi } from "vitest";

import { OperationKind } from "@/generated/prisma/client";

const dbMocks = vi.hoisted(() => ({
  ensureDefaultHousehold: vi.fn(),
  getDb: vi.fn(),
}));

vi.mock("@/server/db", () => dbMocks);

import { runMutation } from "./mutations";

describe("runMutation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dbMocks.ensureDefaultHousehold.mockResolvedValue(undefined);
  });

  it("sends PostgreSQL notifications without deserializing the void result", async () => {
    const queryRaw = vi.fn().mockResolvedValue([{ id: "00000000-0000-4000-8000-000000000001" }]);
    const executeRaw = vi.fn().mockResolvedValue(1);
    const tx = {
      $queryRaw: queryRaw,
      $executeRaw: executeRaw,
      household: {
        update: vi.fn().mockResolvedValue({ eventSeq: 42n }),
      },
      operation: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({}),
      },
    };
    const db = {
      $transaction: vi.fn(async (callback: (transaction: typeof tx) => Promise<unknown>) => callback(tx)),
    };
    dbMocks.getDb.mockReturnValue(db);

    const result = await runMutation(
      {
        action: "stock.adjust",
        idempotencyKey: "00000000-0000-4000-8000-000000000010",
        input: { delta: 1 },
      },
      async () => ({
        kind: OperationKind.STOCK_ADJUSTED,
        aggregateType: "stock",
        aggregateId: "00000000-0000-4000-8000-000000000020",
        data: { quantity: 2 },
        eventPayload: { quantity: 2 },
      }),
    );

    expect(result).toMatchObject({ data: { quantity: 2 }, lastEventSeq: "42" });
    expect(queryRaw).toHaveBeenCalledTimes(1);
    expect(executeRaw).toHaveBeenCalledTimes(1);

    const [query, payload] = executeRaw.mock.calls[0] as unknown as [TemplateStringsArray, string];
    expect(query.join("?")).toContain("SELECT pg_notify('inventory_events', ?)");
    expect(payload).toBe("42");
  });
});
