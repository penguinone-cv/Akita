export type InventoryItem = {
  id: string;
  categoryId: string;
  name: string;
  quantity: number;
  position: number;
  metadataVersion: number;
  stockVersion: number;
};

export type InventoryCategory = {
  id: string;
  name: string;
  position: number;
  isSystem: boolean;
  metadataVersion: number;
  itemsOrderVersion: number;
};

export type InventorySnapshot = {
  householdId: string;
  categoryOrderVersion: number;
  lastEventSeq: string;
  categories: InventoryCategory[];
  items: InventoryItem[];
};

export type UndoTicket = {
  operationId: string;
  token: string;
  expiresAt: string;
};

export type MutationResult<T> = {
  data: T;
  lastEventSeq: string;
  undo?: UndoTicket;
};

export type MutationResponse<T> = MutationResult<T>;

export type InventoryEvent = {
  seq: string;
  type: string;
  aggregateType: "category" | "item" | "stock" | "inventory";
  aggregateId: string;
  payload: unknown;
  createdAt: string;
};

export type ApiErrorBody = {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
};

export type IdempotentRequest = {
  idempotencyKey?: string;
};

export type CreateCategoryRequest = IdempotentRequest & {
  name: string;
};

export type UpdateCategoryRequest = IdempotentRequest & {
  name: string;
  expectedMetadataVersion: number;
};

export type DeleteCategoryRequest = IdempotentRequest & {
  expectedMetadataVersion: number;
};

export type ReorderCategoriesRequest = IdempotentRequest & {
  orderedIds: string[];
  expectedOrderVersion: number;
};

export type CreateItemRequest = IdempotentRequest & {
  name: string;
  categoryId: string;
  quantity?: number;
};

export type UpdateItemRequest = IdempotentRequest & {
  name?: string;
  categoryId?: string;
  expectedMetadataVersion: number;
};

export type DeleteItemRequest = IdempotentRequest & {
  expectedMetadataVersion: number;
};

export type ReorderItemsRequest = IdempotentRequest & {
  orderedIds: string[];
  expectedOrderVersion: number;
};

export type AdjustStockRequest = IdempotentRequest & {
  delta: -1 | 1;
};

export type SetStockRequest = IdempotentRequest & {
  quantity: number;
  expectedStockVersion: number;
};

export type UndoRequest = IdempotentRequest & {
  token: string;
};

export type ReorderResponse = {
  orderedIds: string[];
  orderVersion: number;
};
