import { appPath } from "@/lib/app-path";
import type {
  AdjustStockRequest,
  ApiErrorBody,
  CreateCategoryRequest,
  CreateItemRequest,
  DeleteCategoryRequest,
  DeleteItemRequest,
  InventoryCategory,
  InventoryItem,
  InventorySnapshot,
  MutationResult,
  ReorderCategoriesRequest,
  ReorderItemsRequest,
  ReorderResponse,
  SetStockRequest,
  UndoRequest,
  UpdateCategoryRequest,
  UpdateItemRequest,
} from "@/lib/contracts";

export class InventoryApiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly details?: unknown;

  constructor(message: string, code = "UNKNOWN_ERROR", status = 500, details?: unknown) {
    super(message);
    this.name = "InventoryApiError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

function idempotencyKey(): string {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(appPath(path), {
    ...init,
    headers: {
      Accept: "application/json",
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...init?.headers,
    },
    cache: "no-store",
  });

  if (!response.ok) {
    let body: ApiErrorBody | null = null;
    try {
      body = (await response.json()) as ApiErrorBody;
    } catch {
      // The fallback below is intentionally user-friendly when a proxy returns HTML.
    }
    throw new InventoryApiError(
      body?.error.message ?? "通信に失敗しました。もう一度お試しください。",
      body?.error.code,
      response.status,
      body?.error.details,
    );
  }

  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export function getInventory(signal?: AbortSignal): Promise<InventorySnapshot> {
  return requestJson<InventorySnapshot>("/api/inventory", { signal });
}

export function addCategory(name: string): Promise<MutationResult<InventoryCategory>> {
  const body: CreateCategoryRequest = { name, idempotencyKey: idempotencyKey() };
  return requestJson("/api/categories", { method: "POST", body: JSON.stringify(body) });
}

export function renameCategory(category: InventoryCategory, name: string): Promise<MutationResult<InventoryCategory>> {
  const body: UpdateCategoryRequest = {
    name,
    expectedMetadataVersion: category.metadataVersion,
    idempotencyKey: idempotencyKey(),
  };
  return requestJson(`/api/categories/${encodeURIComponent(category.id)}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

export function removeCategory(category: InventoryCategory): Promise<MutationResult<InventoryCategory>> {
  const body: DeleteCategoryRequest = {
    expectedMetadataVersion: category.metadataVersion,
    idempotencyKey: idempotencyKey(),
  };
  return requestJson(`/api/categories/${encodeURIComponent(category.id)}`, {
    method: "DELETE",
    body: JSON.stringify(body),
  });
}

export function saveCategoryOrder(
  orderedIds: string[],
  expectedOrderVersion: number,
): Promise<MutationResult<ReorderResponse>> {
  const body: ReorderCategoriesRequest = {
    orderedIds,
    expectedOrderVersion,
    idempotencyKey: idempotencyKey(),
  };
  return requestJson("/api/categories/reorder", { method: "PUT", body: JSON.stringify(body) });
}

export function addItem(values: {
  name: string;
  categoryId: string;
  quantity: number;
}): Promise<MutationResult<InventoryItem>> {
  const body: CreateItemRequest = { ...values, idempotencyKey: idempotencyKey() };
  return requestJson("/api/items", { method: "POST", body: JSON.stringify(body) });
}

export function updateItemMetadata(
  item: InventoryItem,
  values: { name?: string; categoryId?: string },
): Promise<MutationResult<InventoryItem>> {
  const body: UpdateItemRequest = {
    ...values,
    expectedMetadataVersion: item.metadataVersion,
    idempotencyKey: idempotencyKey(),
  };
  return requestJson(`/api/items/${encodeURIComponent(item.id)}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

export function removeItem(item: InventoryItem): Promise<MutationResult<InventoryItem>> {
  const body: DeleteItemRequest = {
    expectedMetadataVersion: item.metadataVersion,
    idempotencyKey: idempotencyKey(),
  };
  return requestJson(`/api/items/${encodeURIComponent(item.id)}`, {
    method: "DELETE",
    body: JSON.stringify(body),
  });
}

export function adjustItemStock(itemId: string, delta: -1 | 1): Promise<MutationResult<InventoryItem>> {
  const body: AdjustStockRequest = { delta, idempotencyKey: idempotencyKey() };
  return requestJson(`/api/items/${encodeURIComponent(itemId)}/stock/adjust`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function setItemStock(item: InventoryItem, quantity: number): Promise<MutationResult<InventoryItem>> {
  const body: SetStockRequest = {
    quantity,
    expectedStockVersion: item.stockVersion,
    idempotencyKey: idempotencyKey(),
  };
  return requestJson(`/api/items/${encodeURIComponent(item.id)}/stock`, {
    method: "PUT",
    body: JSON.stringify(body),
  });
}

export function saveItemOrder(
  category: InventoryCategory,
  orderedIds: string[],
): Promise<MutationResult<ReorderResponse>> {
  const body: ReorderItemsRequest = {
    orderedIds,
    expectedOrderVersion: category.itemsOrderVersion,
    idempotencyKey: idempotencyKey(),
  };
  return requestJson(`/api/categories/${encodeURIComponent(category.id)}/items/reorder`, {
    method: "PUT",
    body: JSON.stringify(body),
  });
}

export function undoOperation(operationId: string, token: string): Promise<MutationResult<unknown>> {
  const body: UndoRequest = { token, idempotencyKey: idempotencyKey() };
  return requestJson(`/api/operations/${encodeURIComponent(operationId)}/undo`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function inventoryEventsUrl(after: string): string {
  const query = after ? `?after=${encodeURIComponent(after)}` : "";
  return appPath(`/api/events${query}`);
}
