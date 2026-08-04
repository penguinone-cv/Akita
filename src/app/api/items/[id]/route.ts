import { NextResponse } from "next/server";
import { z } from "zod";
import { deleteItem, updateItem } from "@/server/inventory-service";
import { idempotencyKey, parseBody, withApiErrors } from "@/server/http";
import { deleteItemSchema, updateItemSchema } from "@/server/schemas";

export const runtime = "nodejs";

type Context = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: Context): Promise<Response> {
  return withApiErrors(async () => {
    const id = z.uuid().parse((await context.params).id);
    const input = await parseBody(request, updateItemSchema);
    return NextResponse.json(await updateItem(id, input, idempotencyKey(request, input.idempotencyKey)));
  });
}
export async function DELETE(request: Request, context: Context): Promise<Response> {
  return withApiErrors(async () => {
    const id = z.uuid().parse((await context.params).id);
    const input = await parseBody(request, deleteItemSchema);
    return NextResponse.json(await deleteItem(id, input, idempotencyKey(request, input.idempotencyKey)));
  });
}
