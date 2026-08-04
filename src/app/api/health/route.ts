import { NextResponse } from "next/server";
import { DEFAULT_HOUSEHOLD_ID } from "@/server/constants";
import { ensureDefaultHousehold, getDb } from "@/server/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  try {
    await ensureDefaultHousehold();
    await getDb().$queryRaw`SELECT 1`;
    return NextResponse.json({
      status: "ok",
      database: "ok",
      householdId: DEFAULT_HOUSEHOLD_ID,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { status: "unavailable", database: "error", timestamp: new Date().toISOString() },
      { status: 503 },
    );
  }
}
