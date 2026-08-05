import { createHash, randomBytes, randomUUID } from "node:crypto";
import type { MutationResult, UndoTicket } from "@/lib/contracts";
import { OperationKind, Prisma } from "@/generated/prisma/client";
import { DEFAULT_HOUSEHOLD_ID } from "@/server/constants";
import { ensureDefaultHousehold, getDb } from "@/server/db";
import { ApiError, isPrismaError } from "@/server/http";

export type Tx = Prisma.TransactionClient;

export type MutationPlan<T> = {
  kind: OperationKind;
  aggregateType: "category" | "item" | "stock" | "inventory";
  aggregateId: string;
  data: T;
  eventPayload: Prisma.InputJsonValue;
  delta?: number;
  before?: Prisma.InputJsonValue;
  after?: Prisma.InputJsonValue;
  undo?: {
    token: string;
    expiresAt: Date;
  };
  undoOfId?: string;
};

type RunMutationOptions = {
  action: string;
  idempotencyKey: string;
  input: unknown;
};

function requestHash(action: string, input: unknown): string {
  return createHash("sha256")
    .update(JSON.stringify({ action, input }))
    .digest("hex");
}

export function newUndoToken(): string {
  return randomBytes(24).toString("base64url");
}

export function undoTokenHash(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function runMutation<T>(
  options: RunMutationOptions,
  mutate: (tx: Tx, context: { operationId: string; now: Date }) => Promise<MutationPlan<T>>,
): Promise<MutationResult<T>> {
  await ensureDefaultHousehold();
  const db = getDb();
  const hash = requestHash(options.action, options.input);

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await db.$transaction(async (tx) => {
        // One short lock per household gives every mutation and event a single,
        // deterministic order. This is intentionally simple for a family-scale app.
        await tx.$queryRaw`
          SELECT id FROM households
          WHERE id = CAST(${DEFAULT_HOUSEHOLD_ID} AS uuid)
          FOR UPDATE
        `;
        const previous = await tx.operation.findFirst({
          where: {
            householdId: DEFAULT_HOUSEHOLD_ID,
            idempotencyKey: options.idempotencyKey,
          },
          select: { requestHash: true, responsePayload: true },
        });

        if (previous) {
          if (previous.requestHash !== hash) {
            throw new ApiError(
              409,
              "IDEMPOTENCY_KEY_REUSED",
              "同じ操作IDが異なる内容に使われました。",
            );
          }
          if (!previous.responsePayload) {
            throw new ApiError(409, "OPERATION_IN_PROGRESS", "操作を再試行してください。");
          }
          return previous.responsePayload as unknown as MutationResult<T>;
        }

        const operationId = randomUUID();
        const now = new Date();
        const plan = await mutate(tx, { operationId, now });
        const household = await tx.household.update({
          where: { id: DEFAULT_HOUSEHOLD_ID },
          data: { eventSeq: { increment: 1 } },
          select: { eventSeq: true },
        });
        const lastEventSeq = household.eventSeq.toString();
        const undo: UndoTicket | undefined = plan.undo
          ? {
              operationId,
              token: plan.undo.token,
              expiresAt: plan.undo.expiresAt.toISOString(),
            }
          : undefined;
        const response: MutationResult<T> = {
          data: plan.data,
          lastEventSeq,
          ...(undo ? { undo } : {}),
        };

        await tx.operation.create({
          data: {
            id: operationId,
            householdId: DEFAULT_HOUSEHOLD_ID,
            householdSeq: household.eventSeq,
            idempotencyKey: options.idempotencyKey,
            requestHash: hash,
            kind: plan.kind,
            aggregateType: plan.aggregateType,
            aggregateId: plan.aggregateId,
            delta: plan.delta,
            before: plan.before,
            after: plan.after,
            eventPayload: plan.eventPayload,
            responsePayload: response as unknown as Prisma.InputJsonValue,
            undoTokenHash: plan.undo ? undoTokenHash(plan.undo.token) : undefined,
            undoExpiresAt: plan.undo?.expiresAt,
            undoOfId: plan.undoOfId,
          },
        });

        await tx.$executeRaw`SELECT pg_notify('inventory_events', ${lastEventSeq})`;
        return response;
      }, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        maxWait: 5_000,
        timeout: 10_000,
      });
    } catch (error) {
      if (isPrismaError(error, "P2034") && attempt < 2) {
        continue;
      }
      throw error;
    }
  }

  throw new ApiError(503, "RETRY_LATER", "競合が続いています。少し待って再試行してください。");
}
