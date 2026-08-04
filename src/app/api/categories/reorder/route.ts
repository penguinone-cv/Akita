import { NextResponse } from "next/server";
import { reorderCategories } from "@/server/inventory-service";
import { idempotencyKey, parseBody, withApiErrors } from "@/server/http";
import { reorderSchema } from "@/server/schemas";

export const runtime = "nodejs";

export async function PUT(request: Request): Promise<Response> {
  return withApiErrors(async () => {
    const input = await parseBody(request, reorderSchema);
    return NextResponse.json(await reorderCategories(input, idempotencyKey(request, input.idempotencyKey)));
  });
}
