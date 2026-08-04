import { NextResponse } from "next/server";
import { createItem } from "@/server/inventory-service";
import { idempotencyKey, parseBody, withApiErrors } from "@/server/http";
import { createItemSchema } from "@/server/schemas";

export const runtime = "nodejs";

export async function POST(request: Request): Promise<Response> {
  return withApiErrors(async () => {
    const input = await parseBody(request, createItemSchema);
    return NextResponse.json(
      await createItem(input, idempotencyKey(request, input.idempotencyKey)),
      { status: 201 },
    );
  });
}
