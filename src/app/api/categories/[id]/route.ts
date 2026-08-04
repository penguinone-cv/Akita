import { NextResponse } from "next/server";
import { z } from "zod";
import { deleteCategory, updateCategory } from "@/server/inventory-service";
import { idempotencyKey, parseBody, withApiErrors } from "@/server/http";
import { deleteCategorySchema, updateCategorySchema } from "@/server/schemas";

export const runtime = "nodejs";

type Context = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: Context): Promise<Response> {
  return withApiErrors(async () => {
    const id = z.uuid().parse((await context.params).id);
    const input = await parseBody(request, updateCategorySchema);
    return NextResponse.json(await updateCategory(id, input, idempotencyKey(request, input.idempotencyKey)));
  });
}
export async function DELETE(request: Request, context: Context): Promise<Response> {
  return withApiErrors(async () => {
    const id = z.uuid().parse((await context.params).id);
    const input = await parseBody(request, deleteCategorySchema);
    return NextResponse.json(await deleteCategory(id, input, idempotencyKey(request, input.idempotencyKey)));
  });
}
