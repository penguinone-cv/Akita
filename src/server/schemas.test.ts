import { describe, expect, it } from "vitest";

import {
  adjustStockSchema,
  createItemSchema,
  setStockSchema,
} from "./schemas";

const categoryId = "9e0c9c04-d3a0-4db4-bffc-e1d78e926224";

describe("stock input schemas", () => {
  it("defaults a new item's quantity to zero", () => {
    expect(
      createItemSchema.parse({ name: "牛乳", categoryId }),
    ).toMatchObject({ quantity: 0 });
  });

  it.each([-1, 0.5, 2_147_483_648])(
    "rejects an invalid new-item quantity: %s",
    (quantity) => {
      expect(
        createItemSchema.safeParse({ name: "牛乳", categoryId, quantity }).success,
      ).toBe(false);
    },
  );

  it("accepts both stock boundaries", () => {
    expect(
      setStockSchema.safeParse({ quantity: 0, expectedStockVersion: 0 }).success,
    ).toBe(true);
    expect(
      setStockSchema.safeParse({
        quantity: 2_147_483_647,
        expectedStockVersion: 12,
      }).success,
    ).toBe(true);
  });

  it.each([-1, 1])("accepts the supported adjustment delta %s", (delta) => {
    expect(adjustStockSchema.safeParse({ delta }).success).toBe(true);
  });

  it.each([-2, 0, 2])("rejects unsupported adjustment delta %s", (delta) => {
    expect(adjustStockSchema.safeParse({ delta }).success).toBe(false);
  });
});
