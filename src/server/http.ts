import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z, ZodError, type ZodType } from "zod";
import type { ApiErrorBody } from "@/lib/contracts";

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
  }
}

export async function parseBody<T>(request: Request, schema: ZodType<T>): Promise<T> {
  let input: unknown;
  try {
    input = await request.json();
  } catch {
    throw new ApiError(400, "INVALID_JSON", "リクエスト本文を読み取れませんでした。");
  }
  return schema.parse(input);
}

export function idempotencyKey(request: Request, bodyKey?: string): string {
  const value = request.headers.get("idempotency-key") ?? bodyKey ?? randomUUID();
  if (!z.uuid().safeParse(value).success) {
    throw new ApiError(400, "INVALID_IDEMPOTENCY_KEY", "操作IDの形式が正しくありません。");
  }
  return value;
}

export function apiErrorResponse(error: unknown): NextResponse<ApiErrorBody> {
  if (error instanceof ApiError) {
    return NextResponse.json(
      { error: { code: error.code, message: error.message, details: error.details } },
      { status: error.status },
    );
  }

  if (error instanceof ZodError) {
    return NextResponse.json(
      {
        error: {
          code: "VALIDATION_ERROR",
          message: "入力内容を確認してください。",
          details: error.issues,
        },
      },
      { status: 400 },
    );
  }

  if (isPrismaError(error, "P2002")) {
    return NextResponse.json(
      { error: { code: "NAME_ALREADY_EXISTS", message: "同じ名前がすでに使われています。" } },
      { status: 409 },
    );
  }

  console.error(error);
  return NextResponse.json(
    { error: { code: "INTERNAL_ERROR", message: "サーバーでエラーが発生しました。" } },
    { status: 500 },
  );
}

export function isPrismaError(error: unknown, code: string): boolean {
  return typeof error === "object"
    && error !== null
    && "code" in error
    && (error as { code?: unknown }).code === code;
}

export async function withApiErrors(handler: () => Promise<Response>): Promise<Response> {
  try {
    return await handler();
  } catch (error) {
    return apiErrorResponse(error);
  }
}
