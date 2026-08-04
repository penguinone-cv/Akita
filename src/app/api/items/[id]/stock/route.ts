import { NextResponse } from "next/server";
import { z } from "zod";
import { setStock } from "@/server/inventory-service";
import { idempotencyKey, parseBody, withApiErrors } from "@/server/http";
import { setStockSchema } from "@/server/schemas";

export const runtime = "nodejs";

type Context = { params: Promise<{ id: string }> };

export async function PUT(request: Request, context: Context): Promise<Response> {
  return withApiErrors(async () => {
    const id = z.uuid().parse((await context.params).id);
    const input = await parseBody(request, setStockSchema);
    return NextResponse.json(await setStock(id, input, idempotencyKey(request, input.idempotencyKey)));
  });
}
