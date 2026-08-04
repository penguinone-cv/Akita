import { describe, expect, it } from "vitest";

import { cleanName, nameKey } from "./names";

describe("cleanName", () => {
  it("normalizes full-width characters and surrounding/repeated whitespace", () => {
    expect(cleanName("  Ｍｉｌｋ　　ｓｏａｐ\n refill  ", 50)).toBe(
      "Milk soap refill",
    );
  });

  it("accepts a name exactly at the Unicode code-point limit", () => {
    expect(cleanName("牛乳🍼", 3)).toBe("牛乳🍼");
  });

  it("rejects a blank name", () => {
    expect(() => cleanName(" \n　\t ", 50)).toThrowError(
      expect.objectContaining({
        status: 400,
        code: "NAME_REQUIRED",
      }),
    );
  });

  it("rejects a name over the configured limit", () => {
    expect(() => cleanName("牛乳🍼追加", 3)).toThrowError(
      expect.objectContaining({
        status: 400,
        code: "NAME_TOO_LONG",
      }),
    );
  });
});

describe("nameKey", () => {
  it("produces a case-insensitive NFKC comparison key", () => {
    expect(nameKey("ＭＩＬＫ １２")).toBe("milk 12");
  });
});
