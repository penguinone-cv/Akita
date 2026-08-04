import { NextResponse } from "next/server";
import { z } from "zod";
import { undoOperation } from "@/server/inventory-service";
import { idempotencyKey, parseBody, withApiErrors } from "@/server/http";
import { undoSchema } from "@/server/schemas";

export const runtime = "nodejs";

type Context = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: Context): Promise<Response> {
  return withApiErrors(async () => {
    const id = z.uuid().parse((await context.params).id);
    const input = await parseBody(request, undoSchema);
    return NextResponse.json(await undoOperation(id, input, idempotencyKey(request, input.idempotencyKey)));
  });
}
