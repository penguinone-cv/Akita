import type { InventoryEvent } from "@/lib/contracts";
import {
  DEFAULT_HOUSEHOLD_ID,
  SSE_HEARTBEAT_INTERVAL_MS,
  SSE_POLL_INTERVAL_MS,
} from "@/server/constants";
import { ensureDefaultHousehold, getDb } from "@/server/db";
import { ApiError, apiErrorResponse } from "@/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const encoder = new TextEncoder();

function delay(milliseconds: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal.aborted) {
      resolve();
      return;
    }
    const onAbort = () => {
      clearTimeout(timer);
      resolve();
    };
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, milliseconds);
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

function parseCursor(request: Request): bigint {
  const url = new URL(request.url);
  const values = [url.searchParams.get("after"), request.headers.get("last-event-id")]
    .filter((value): value is string => value !== null);
  if (values.some((value) => !/^\d+$/.test(value))) {
    throw new ApiError(400, "INVALID_EVENT_CURSOR", "イベント番号が正しくありません。");
  }
  return values.reduce((maximum, value) => {
    const cursor = BigInt(value);
    return cursor > maximum ? cursor : maximum;
  }, 0n);
}

export async function GET(request: Request): Promise<Response> {
  try {
    await ensureDefaultHousehold();
    let cursor = parseCursor(request);
    let stopped = false;
    let lastHeartbeat = Date.now();

    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode("retry: 2000\n\n"));
        request.signal.addEventListener("abort", () => {
          stopped = true;
        }, { once: true });

        void (async () => {
          try {
            while (!stopped) {
              const operations = await getDb().operation.findMany({
                where: {
                  householdId: DEFAULT_HOUSEHOLD_ID,
                  householdSeq: { gt: cursor },
                },
                orderBy: { householdSeq: "asc" },
                take: 100,
                select: {
                  householdSeq: true,
                  kind: true,
                  aggregateType: true,
                  aggregateId: true,
                  eventPayload: true,
                  createdAt: true,
                },
              });

              for (const operation of operations) {
                cursor = operation.householdSeq;
                const event: InventoryEvent = {
                  seq: operation.householdSeq.toString(),
                  type: operation.kind,
                  aggregateType: operation.aggregateType as InventoryEvent["aggregateType"],
                  aggregateId: operation.aggregateId,
                  payload: operation.eventPayload,
                  createdAt: operation.createdAt.toISOString(),
                };
                controller.enqueue(encoder.encode(`id: ${event.seq}\ndata: ${JSON.stringify(event)}\n\n`));
              }

              if (Date.now() - lastHeartbeat >= SSE_HEARTBEAT_INTERVAL_MS) {
                controller.enqueue(encoder.encode(`: heartbeat ${new Date().toISOString()}\n\n`));
                lastHeartbeat = Date.now();
              }

              if (operations.length < 100) {
                await delay(SSE_POLL_INTERVAL_MS, request.signal);
              }
            }
            controller.close();
          } catch (error) {
            if (!stopped) controller.error(error);
          }
        })();
      },
      cancel() {
        stopped = true;
      },
    });

    return new Response(stream, {
      headers: {
        "Cache-Control": "no-store, no-cache, no-transform",
        "Connection": "keep-alive",
        "Content-Type": "text/event-stream; charset=utf-8",
        "X-Accel-Buffering": "no",
      },
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
