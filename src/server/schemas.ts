import { z } from "zod";
import { MAX_QUANTITY } from "@/server/constants";

const idempotency = {
  idempotencyKey: z.uuid().optional(),
};

export const createCategorySchema = z.object({
  ...idempotency,
  name: z.string(),
});

export const updateCategorySchema = z.object({
  ...idempotency,
  name: z.string(),
  expectedMetadataVersion: z.int().nonnegative(),
});

export const deleteCategorySchema = z.object({
  ...idempotency,
  expectedMetadataVersion: z.int().nonnegative(),
});

export const reorderSchema = z.object({
  ...idempotency,
  orderedIds: z.array(z.uuid()).max(5_000),
  expectedOrderVersion: z.int().nonnegative(),
});

export const createItemSchema = z.object({
  ...idempotency,
  name: z.string(),
  categoryId: z.uuid(),
  quantity: z.int().min(0).max(MAX_QUANTITY).default(0),
});

export const updateItemSchema = z.object({
  ...idempotency,
  name: z.string().optional(),
  categoryId: z.uuid().optional(),
  expectedMetadataVersion: z.int().nonnegative(),
}).refine((input) => input.name !== undefined || input.categoryId !== undefined, {
  message: "変更する項目を指定してください。",
});

export const deleteItemSchema = z.object({
  ...idempotency,
  expectedMetadataVersion: z.int().nonnegative(),
});

export const adjustStockSchema = z.object({
  ...idempotency,
  delta: z.union([z.literal(-1), z.literal(1)]),
});

export const setStockSchema = z.object({
  ...idempotency,
  quantity: z.int().min(0).max(MAX_QUANTITY),
  expectedStockVersion: z.int().nonnegative(),
});

export const undoSchema = z.object({
  ...idempotency,
  token: z.string().min(16).max(256),
});
