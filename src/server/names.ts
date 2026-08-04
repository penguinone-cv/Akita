import { ApiError } from "@/server/http";

export function cleanName(value: string, maxLength: number): string {
  const cleaned = value.normalize("NFKC").trim().replace(/\s+/gu, " ");
  if (!cleaned) {
    throw new ApiError(400, "NAME_REQUIRED", "名前を入力してください。");
  }
  if ([...cleaned].length > maxLength) {
    throw new ApiError(400, "NAME_TOO_LONG", `名前は${maxLength}文字以内で入力してください。`);
  }
  return cleaned;
}
export function nameKey(value: string): string {
  return value.normalize("NFKC").toLocaleLowerCase("ja-JP");
}
