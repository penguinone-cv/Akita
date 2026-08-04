import { NextResponse } from "next/server";
import { getInventory } from "@/server/inventory-service";
import { withApiErrors } from "@/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  return withApiErrors(async () => NextResponse.json(await getInventory()));
}
