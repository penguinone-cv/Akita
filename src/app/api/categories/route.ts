import { NextResponse } from "next/server";
import { createCategorySchema } from "@/server/schemas";
import { createCategory } from "@/server/inventory-service";
import { idempotencyKey, parseBody, withApiErrors } from "@/server/http";

export const runtime = "nodejs";

export async function POST(request: Request): Promise<Response> {
  return withApiErrors(async () => {
    const input = await parseBody(request, createCategorySchema);
    return NextResponse.json(
      await createCategory(input, idempotencyKey(request, input.idempotencyKey)),
      { status: 201 },
    );
  });
}
