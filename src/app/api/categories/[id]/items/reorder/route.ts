import { NextResponse } from "next/server";
import { z } from "zod";
import { reorderItems } from "@/server/inventory-service";
import { idempotencyKey, parseBody, withApiErrors } from "@/server/http";
import { reorderSchema } from "@/server/schemas";

export const runtime = "nodejs";

type Context = { params: Promise<{ id: string }> };

export async function PUT(request: Request, context: Context): Promise<Response> {
  return withApiErrors(async () => {
    const categoryId = z.uuid().parse((await context.params).id);
    const input = await parseBody(request, reorderSchema);
    return NextResponse.json(await reorderItems(categoryId, input, idempotencyKey(request, input.idempotencyKey)));
  });
}
