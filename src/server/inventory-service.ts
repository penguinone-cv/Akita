import { timingSafeEqual } from "node:crypto";
import type {
  AdjustStockRequest,
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
import { OperationKind, Prisma } from "@/generated/prisma/client";
import {
  DEFAULT_HOUSEHOLD_ID,
  MAX_QUANTITY,
  SORT_POSITION_GAP,
  UNDO_WINDOW_MS,
} from "@/server/constants";
import { ensureDefaultHousehold, getDb } from "@/server/db";
import { ApiError } from "@/server/http";
import { cleanName, nameKey } from "@/server/names";
import {
  newUndoToken,
  runMutation,
  type Tx,
  undoTokenHash,
} from "@/server/mutations";

type CategoryRow = {
  id: string;
  name: string;
  position: number;
  isSystem: boolean;
  metadataVersion: number;
  itemsOrderVersion: number;
};

type ItemRow = {
  id: string;
  categoryId: string;
  name: string;
  quantity: number;
  position: number;
  metadataVersion: number;
  stockVersion: number;
};

function toCategory(row: CategoryRow): InventoryCategory {
  return {
    id: row.id,
    name: row.name,
    position: row.position,
    isSystem: row.isSystem,
    metadataVersion: row.metadataVersion,
    itemsOrderVersion: row.itemsOrderVersion,
  };
}

function toItem(row: ItemRow): InventoryItem {
  return {
    id: row.id,
    categoryId: row.categoryId,
    name: row.name,
    quantity: row.quantity,
    position: row.position,
    metadataVersion: row.metadataVersion,
    stockVersion: row.stockVersion,
  };
}

function json(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

async function lockHousehold(tx: Tx): Promise<void> {
  const rows = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT id FROM households
    WHERE id = CAST(${DEFAULT_HOUSEHOLD_ID} AS uuid)
    FOR UPDATE
  `;
  if (rows.length === 0) {
    throw new ApiError(503, "HOUSEHOLD_UNAVAILABLE", "在庫データを準備できませんでした。");
  }
}

async function lockCategory(tx: Tx, id: string, includeDeleted = false) {
  await tx.$queryRaw`
    SELECT id FROM categories
    WHERE id = CAST(${id} AS uuid)
      AND household_id = CAST(${DEFAULT_HOUSEHOLD_ID} AS uuid)
    FOR UPDATE
  `;
  const category = await tx.category.findFirst({
    where: {
      id,
      householdId: DEFAULT_HOUSEHOLD_ID,
      ...(includeDeleted ? {} : { deletedAt: null }),
    },
  });
  if (!category) {
    throw new ApiError(404, "CATEGORY_NOT_FOUND", "カテゴリが見つかりません。");
  }
  return category;
}

async function lockItem(tx: Tx, id: string, includeDeleted = false) {
  await tx.$queryRaw`
    SELECT id FROM items
    WHERE id = CAST(${id} AS uuid)
      AND household_id = CAST(${DEFAULT_HOUSEHOLD_ID} AS uuid)
    FOR UPDATE
  `;
  const item = await tx.item.findFirst({
    where: {
      id,
      householdId: DEFAULT_HOUSEHOLD_ID,
      ...(includeDeleted ? {} : { deletedAt: null }),
    },
  });
  if (!item) {
    throw new ApiError(404, "ITEM_NOT_FOUND", "アイテムが見つかりません。");
  }
  return item;
}

function requireVersion(actual: number, expected: number, code: string): void {
  if (actual !== expected) {
    throw new ApiError(409, code, "ほかの端末で変更されています。最新の状態を読み込み直してください。", {
      currentVersion: actual,
    });
  }
}

function requireExactOrder(actualIds: string[], orderedIds: string[]): void {
  const unique = new Set(orderedIds);
  if (
    unique.size !== orderedIds.length
    || actualIds.length !== orderedIds.length
    || actualIds.some((id) => !unique.has(id))
  ) {
    throw new ApiError(409, "ORDER_CONTENT_CHANGED", "一覧の内容が変わりました。再読み込みしてください。");
  }
}

async function hasRestorableName(
  tx: Tx,
  categoryId: string,
  itemNameKey: string,
  now: Date,
  excludeId?: string,
): Promise<boolean> {
  const tombstones = await tx.item.findMany({
    where: {
      householdId: DEFAULT_HOUSEHOLD_ID,
      categoryId,
      nameKey: itemNameKey,
      deletedAt: { not: null },
      ...(excludeId ? { id: { not: excludeId } } : {}),
    },
    select: { id: true },
  });
  if (tombstones.length === 0) return false;

  return await tx.operation.count({
    where: {
      householdId: DEFAULT_HOUSEHOLD_ID,
      kind: OperationKind.ITEM_DELETED,
      aggregateId: { in: tombstones.map((item) => item.id) },
      undoExpiresAt: { gt: now },
      undoneAt: null,
    },
  }) > 0;
}

export async function getInventory(): Promise<InventorySnapshot> {
  await ensureDefaultHousehold();
  const db = getDb();
  return db.$transaction(async (tx) => {
    const household = await tx.household.findUniqueOrThrow({
      where: { id: DEFAULT_HOUSEHOLD_ID },
      select: { categoryOrderVersion: true, eventSeq: true },
    });
    const categories = await tx.category.findMany({
      where: { householdId: DEFAULT_HOUSEHOLD_ID, deletedAt: null },
      orderBy: [{ position: "asc" }, { id: "asc" }],
    });
    const items = await tx.item.findMany({
      where: { householdId: DEFAULT_HOUSEHOLD_ID, deletedAt: null },
      orderBy: [{ categoryId: "asc" }, { position: "asc" }, { id: "asc" }],
    });
    return {
      householdId: DEFAULT_HOUSEHOLD_ID,
      categoryOrderVersion: household.categoryOrderVersion,
      lastEventSeq: household.eventSeq.toString(),
      categories: categories.map(toCategory),
      items: items.map(toItem),
    };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
}

export async function createCategory(
  input: CreateCategoryRequest,
  key: string,
): Promise<MutationResult<InventoryCategory>> {
  const name = cleanName(input.name, 80);
  return runMutation({ action: "category.create", idempotencyKey: key, input }, async (tx) => {
    await lockHousehold(tx);
    const maximum = await tx.category.aggregate({
      where: { householdId: DEFAULT_HOUSEHOLD_ID, deletedAt: null },
      _max: { position: true },
    });
    const category = await tx.category.create({
      data: {
        householdId: DEFAULT_HOUSEHOLD_ID,
        name,
        nameKey: nameKey(name),
        position: (maximum._max.position ?? 0) + SORT_POSITION_GAP,
      },
    });
    const household = await tx.household.update({
      where: { id: DEFAULT_HOUSEHOLD_ID },
      data: { categoryOrderVersion: { increment: 1 } },
      select: { categoryOrderVersion: true },
    });
    const data = toCategory(category);
    return {
      kind: OperationKind.CATEGORY_CREATED,
      aggregateType: "category",
      aggregateId: category.id,
      data,
      after: json(data),
      eventPayload: json({ category: data, categoryOrderVersion: household.categoryOrderVersion }),
    };
  });
}

export async function updateCategory(
  id: string,
  input: UpdateCategoryRequest,
  key: string,
): Promise<MutationResult<InventoryCategory>> {
  const name = cleanName(input.name, 80);
  return runMutation({ action: `category.update:${id}`, idempotencyKey: key, input }, async (tx) => {
    const current = await lockCategory(tx, id);
    requireVersion(current.metadataVersion, input.expectedMetadataVersion, "CATEGORY_CHANGED");
    if (current.isSystem) {
      throw new ApiError(409, "SYSTEM_CATEGORY", "未分類カテゴリの名前は変更できません。");
    }
    const category = await tx.category.update({
      where: { id },
      data: {
        name,
        nameKey: nameKey(name),
        metadataVersion: { increment: 1 },
      },
    });
    const data = toCategory(category);
    return {
      kind: OperationKind.CATEGORY_UPDATED,
      aggregateType: "category",
      aggregateId: id,
      data,
      before: json(toCategory(current)),
      after: json(data),
      eventPayload: json({ category: data }),
    };
  });
}

export async function deleteCategory(
  id: string,
  input: DeleteCategoryRequest,
  key: string,
): Promise<MutationResult<InventoryCategory>> {
  return runMutation({ action: `category.delete:${id}`, idempotencyKey: key, input }, async (tx, { now }) => {
    const category = await lockCategory(tx, id);
    requireVersion(category.metadataVersion, input.expectedMetadataVersion, "CATEGORY_CHANGED");
    if (category.isSystem) {
      throw new ApiError(409, "SYSTEM_CATEGORY", "未分類カテゴリは削除できません。");
    }
    const activeItemCount = await tx.item.count({ where: { categoryId: id, deletedAt: null } });
    if (activeItemCount > 0) {
      throw new ApiError(409, "CATEGORY_NOT_EMPTY", "使用中のカテゴリは削除できません。", { activeItemCount });
    }
    const deletedItems = await tx.item.findMany({
      where: { categoryId: id, deletedAt: { not: null } },
      select: { id: true },
    });
    if (deletedItems.length > 0) {
      const restorableCount = await tx.operation.count({
        where: {
          householdId: DEFAULT_HOUSEHOLD_ID,
          kind: OperationKind.ITEM_DELETED,
          aggregateId: { in: deletedItems.map((item) => item.id) },
          undoExpiresAt: { gt: now },
          undoneAt: null,
        },
      });
      if (restorableCount > 0) {
        throw new ApiError(409, "CATEGORY_HAS_RESTORABLE_ITEMS", "削除を取り消せるアイテムがあるため、少し待ってください。");
      }
    }
    const deleted = await tx.category.update({ where: { id }, data: { deletedAt: now } });
    const household = await tx.household.update({
      where: { id: DEFAULT_HOUSEHOLD_ID },
      data: { categoryOrderVersion: { increment: 1 } },
      select: { categoryOrderVersion: true },
    });
    const data = toCategory(deleted);
    return {
      kind: OperationKind.CATEGORY_DELETED,
      aggregateType: "category",
      aggregateId: id,
      data,
      before: json(toCategory(category)),
      eventPayload: json({ id, categoryOrderVersion: household.categoryOrderVersion }),
    };
  });
}

export async function reorderCategories(
  input: ReorderCategoriesRequest,
  key: string,
): Promise<MutationResult<ReorderResponse>> {
  return runMutation({ action: "category.reorder", idempotencyKey: key, input }, async (tx) => {
    await lockHousehold(tx);
    const household = await tx.household.findUniqueOrThrow({ where: { id: DEFAULT_HOUSEHOLD_ID } });
    requireVersion(household.categoryOrderVersion, input.expectedOrderVersion, "CATEGORY_ORDER_CHANGED");
    const categories = await tx.category.findMany({
      where: { householdId: DEFAULT_HOUSEHOLD_ID, deletedAt: null },
      orderBy: [{ position: "asc" }, { id: "asc" }],
      select: { id: true },
    });
    requireExactOrder(categories.map((category) => category.id), input.orderedIds);
    for (const [index, categoryId] of input.orderedIds.entries()) {
      await tx.category.update({
        where: { id: categoryId },
        data: { position: (index + 1) * SORT_POSITION_GAP },
      });
    }
    const updated = await tx.household.update({
      where: { id: DEFAULT_HOUSEHOLD_ID },
      data: { categoryOrderVersion: { increment: 1 } },
      select: { categoryOrderVersion: true },
    });
    const data = { orderedIds: input.orderedIds, orderVersion: updated.categoryOrderVersion };
    return {
      kind: OperationKind.CATEGORY_REORDERED,
      aggregateType: "inventory",
      aggregateId: DEFAULT_HOUSEHOLD_ID,
      data,
      eventPayload: json(data),
    };
  });
}

export async function createItem(
  input: CreateItemRequest,
  key: string,
): Promise<MutationResult<InventoryItem>> {
  const name = cleanName(input.name, 120);
  const itemNameKey = nameKey(name);
  return runMutation({ action: "item.create", idempotencyKey: key, input }, async (tx, { now }) => {
    const category = await lockCategory(tx, input.categoryId);
    if (await hasRestorableName(tx, category.id, itemNameKey, now)) {
      throw new ApiError(409, "ITEM_RECENTLY_DELETED", "同名アイテムの削除をまだ取り消せるため、少し待ってください。");
    }
    const maximum = await tx.item.aggregate({
      where: { categoryId: category.id, deletedAt: null },
      _max: { position: true },
    });
    const item = await tx.item.create({
      data: {
        householdId: DEFAULT_HOUSEHOLD_ID,
        categoryId: category.id,
        name,
        nameKey: itemNameKey,
        quantity: input.quantity ?? 0,
        position: (maximum._max.position ?? 0) + SORT_POSITION_GAP,
      },
    });
    await tx.category.update({
      where: { id: category.id },
      data: { itemsOrderVersion: { increment: 1 } },
    });
    const data = toItem(item);
    return {
      kind: OperationKind.ITEM_CREATED,
      aggregateType: "item",
      aggregateId: item.id,
      data,
      after: json(data),
      eventPayload: json({ item: data }),
    };
  });
}

export async function updateItem(
  id: string,
  input: UpdateItemRequest,
  key: string,
): Promise<MutationResult<InventoryItem>> {
  const cleanedName = input.name === undefined ? undefined : cleanName(input.name, 120);
  return runMutation({ action: `item.update:${id}`, idempotencyKey: key, input }, async (tx, { now }) => {
    const initial = await tx.item.findFirst({
      where: { id, householdId: DEFAULT_HOUSEHOLD_ID, deletedAt: null },
    });
    if (!initial) throw new ApiError(404, "ITEM_NOT_FOUND", "アイテムが見つかりません。");
    const targetCategoryId = input.categoryId ?? initial.categoryId;
    for (const categoryId of [...new Set([initial.categoryId, targetCategoryId])].sort()) {
      await lockCategory(tx, categoryId);
    }
    const current = await lockItem(tx, id);
    if (current.categoryId !== initial.categoryId) {
      throw new ApiError(409, "ITEM_CHANGED", "アイテムのカテゴリが変更されました。再読み込みしてください。");
    }
    requireVersion(current.metadataVersion, input.expectedMetadataVersion, "ITEM_CHANGED");
    const nextName = cleanedName ?? current.name;
    const nextNameKey = nameKey(nextName);
    if (await hasRestorableName(tx, targetCategoryId, nextNameKey, now, id)) {
      throw new ApiError(409, "ITEM_RECENTLY_DELETED", "同名アイテムの削除をまだ取り消せるため、少し待ってください。");
    }
    let position = current.position;
    if (targetCategoryId !== current.categoryId) {
      const maximum = await tx.item.aggregate({
        where: { categoryId: targetCategoryId, deletedAt: null },
        _max: { position: true },
      });
      position = (maximum._max.position ?? 0) + SORT_POSITION_GAP;
    }
    const item = await tx.item.update({
      where: { id },
      data: {
        name: nextName,
        nameKey: nextNameKey,
        categoryId: targetCategoryId,
        position,
        metadataVersion: { increment: 1 },
      },
    });
    if (targetCategoryId !== current.categoryId) {
      await tx.category.update({
        where: { id: current.categoryId },
        data: { itemsOrderVersion: { increment: 1 } },
      });
      await tx.category.update({
        where: { id: targetCategoryId },
        data: { itemsOrderVersion: { increment: 1 } },
      });
    }
    const data = toItem(item);
    return {
      kind: OperationKind.ITEM_UPDATED,
      aggregateType: "item",
      aggregateId: id,
      data,
      before: json(toItem(current)),
      after: json(data),
      eventPayload: json({ item: data }),
    };
  });
}

export async function deleteItem(
  id: string,
  input: DeleteItemRequest,
  key: string,
): Promise<MutationResult<InventoryItem>> {
  return runMutation({ action: `item.delete:${id}`, idempotencyKey: key, input }, async (tx, { now }) => {
    const initial = await tx.item.findFirst({ where: { id, householdId: DEFAULT_HOUSEHOLD_ID, deletedAt: null } });
    if (!initial) throw new ApiError(404, "ITEM_NOT_FOUND", "アイテムが見つかりません。");
    await lockCategory(tx, initial.categoryId);
    const current = await lockItem(tx, id);
    requireVersion(current.metadataVersion, input.expectedMetadataVersion, "ITEM_CHANGED");
    const deleted = await tx.item.update({
      where: { id },
      data: { deletedAt: now, metadataVersion: { increment: 1 } },
    });
    const category = await tx.category.update({
      where: { id: current.categoryId },
      data: { itemsOrderVersion: { increment: 1 } },
      select: { itemsOrderVersion: true },
    });
    const token = newUndoToken();
    const expiresAt = new Date(now.getTime() + UNDO_WINDOW_MS);
    const data = toItem(deleted);
    return {
      kind: OperationKind.ITEM_DELETED,
      aggregateType: "item",
      aggregateId: id,
      data,
      before: json(toItem(current)),
      eventPayload: json({ id, categoryId: current.categoryId, itemsOrderVersion: category.itemsOrderVersion }),
      undo: { token, expiresAt },
    };
  });
}

export async function reorderItems(
  categoryId: string,
  input: ReorderItemsRequest,
  key: string,
): Promise<MutationResult<ReorderResponse>> {
  return runMutation({ action: `item.reorder:${categoryId}`, idempotencyKey: key, input }, async (tx) => {
    const category = await lockCategory(tx, categoryId);
    requireVersion(category.itemsOrderVersion, input.expectedOrderVersion, "ITEM_ORDER_CHANGED");
    const items = await tx.item.findMany({
      where: { categoryId, deletedAt: null },
      orderBy: [{ position: "asc" }, { id: "asc" }],
      select: { id: true },
    });
    requireExactOrder(items.map((item) => item.id), input.orderedIds);
    for (const [index, itemId] of input.orderedIds.entries()) {
      await tx.item.update({
        where: { id: itemId },
        data: { position: (index + 1) * SORT_POSITION_GAP },
      });
    }
    const updated = await tx.category.update({
      where: { id: categoryId },
      data: { itemsOrderVersion: { increment: 1 } },
      select: { itemsOrderVersion: true },
    });
    const data = { orderedIds: input.orderedIds, orderVersion: updated.itemsOrderVersion };
    return {
      kind: OperationKind.ITEM_REORDERED,
      aggregateType: "category",
      aggregateId: categoryId,
      data,
      eventPayload: json({ categoryId, ...data }),
    };
  });
}

export async function adjustStock(
  id: string,
  input: AdjustStockRequest,
  key: string,
): Promise<MutationResult<InventoryItem>> {
  return runMutation({ action: `stock.adjust:${id}`, idempotencyKey: key, input }, async (tx, { now }) => {
    const current = await lockItem(tx, id);
    const quantity = current.quantity + input.delta;
    if (quantity < 0) {
      throw new ApiError(409, "QUANTITY_AT_MINIMUM", "在庫数は0未満にできません。", { quantity: current.quantity });
    }
    if (quantity > MAX_QUANTITY) {
      throw new ApiError(409, "QUANTITY_AT_MAXIMUM", "在庫数が上限に達しています。", { quantity: current.quantity });
    }
    if (quantity > 2_147_483_647) {
      throw new ApiError(409, "QUANTITY_AT_MAXIMUM", "これ以上在庫数を増やせません。", { quantity: current.quantity });
    }
    const item = await tx.item.update({
      where: { id },
      data: { quantity, stockVersion: { increment: 1 } },
    });
    const token = newUndoToken();
    const expiresAt = new Date(now.getTime() + UNDO_WINDOW_MS);
    const data = toItem(item);
    return {
      kind: OperationKind.STOCK_ADJUSTED,
      aggregateType: "stock",
      aggregateId: id,
      data,
      delta: input.delta,
      before: json({ quantity: current.quantity, stockVersion: current.stockVersion }),
      after: json({ quantity: item.quantity, stockVersion: item.stockVersion }),
      eventPayload: json({ item: data, delta: input.delta }),
      undo: { token, expiresAt },
    };
  });
}

export async function setStock(
  id: string,
  input: SetStockRequest,
  key: string,
): Promise<MutationResult<InventoryItem>> {
  return runMutation({ action: `stock.set:${id}`, idempotencyKey: key, input }, async (tx, { now }) => {
    const current = await lockItem(tx, id);
    requireVersion(current.stockVersion, input.expectedStockVersion, "STOCK_CHANGED");
    const delta = input.quantity - current.quantity;
    const item = await tx.item.update({
      where: { id },
      data: { quantity: input.quantity, stockVersion: { increment: 1 } },
    });
    const token = newUndoToken();
    const expiresAt = new Date(now.getTime() + UNDO_WINDOW_MS);
    const data = toItem(item);
    return {
      kind: OperationKind.STOCK_SET,
      aggregateType: "stock",
      aggregateId: id,
      data,
      delta,
      before: json({ quantity: current.quantity, stockVersion: current.stockVersion }),
      after: json({ quantity: item.quantity, stockVersion: item.stockVersion }),
      eventPayload: json({ item: data, delta }),
      undo: { token, expiresAt },
    };
  });
}

function validUndoToken(storedHash: string | null, token: string): boolean {
  if (!storedHash) return false;
  const actual = Buffer.from(storedHash, "hex");
  const supplied = Buffer.from(undoTokenHash(token), "hex");
  return actual.length === supplied.length && timingSafeEqual(actual, supplied);
}

export async function undoOperation(
  operationId: string,
  input: UndoRequest,
  key: string,
): Promise<MutationResult<InventoryItem>> {
  await ensureDefaultHousehold();
  const originalBefore = await getDb().operation.findFirst({
    where: { id: operationId, householdId: DEFAULT_HOUSEHOLD_ID },
    include: { undoneBy: true },
  });
  if (!originalBefore || !validUndoToken(originalBefore.undoTokenHash, input.token)) {
    throw new ApiError(404, "UNDO_NOT_FOUND", "取り消せる操作が見つかりません。");
  }
  if (originalBefore.undoneBy?.responsePayload) {
    return originalBefore.undoneBy.responsePayload as unknown as MutationResult<InventoryItem>;
  }

  try {
    return await runMutation({ action: `operation.undo:${operationId}`, idempotencyKey: key, input }, async (tx, { now }) => {
      await tx.$queryRaw`
        SELECT id FROM operations
        WHERE id = CAST(${operationId} AS uuid)
          AND household_id = CAST(${DEFAULT_HOUSEHOLD_ID} AS uuid)
        FOR UPDATE
      `;
      const original = await tx.operation.findFirst({
        where: { id: operationId, householdId: DEFAULT_HOUSEHOLD_ID },
      });
      if (!original || !validUndoToken(original.undoTokenHash, input.token)) {
        throw new ApiError(404, "UNDO_NOT_FOUND", "取り消せる操作が見つかりません。");
      }
      if (original.undoneAt) {
        throw new ApiError(409, "ALREADY_UNDONE", "この操作はすでに取り消されています。");
      }
      if (!original.undoExpiresAt || original.undoExpiresAt.getTime() < now.getTime()) {
        throw new ApiError(410, "UNDO_EXPIRED", "取り消し可能な時間を過ぎました。");
      }

      if (original.kind === OperationKind.STOCK_ADJUSTED || original.kind === OperationKind.STOCK_SET) {
        const item = await lockItem(tx, original.aggregateId);
        const inverseDelta = -(original.delta ?? 0);
        const quantity = item.quantity + inverseDelta;
        if (quantity < 0 || quantity > MAX_QUANTITY) {
          throw new ApiError(409, "UNDO_OUT_OF_RANGE", "その後の変更があるため取り消せません。", {
            quantity: item.quantity,
          });
        }
        if (quantity > 2_147_483_647) {
          throw new ApiError(409, "UNDO_WOULD_EXCEED_MAXIMUM", "その後の変更があるため取り消せません。", {
            quantity: item.quantity,
          });
        }
        const updated = await tx.item.update({
          where: { id: item.id },
          data: { quantity, stockVersion: { increment: 1 } },
        });
        await tx.operation.update({ where: { id: operationId }, data: { undoneAt: now } });
        const data = toItem(updated);
        return {
          kind: OperationKind.STOCK_UNDONE,
          aggregateType: "stock",
          aggregateId: item.id,
          data,
          delta: inverseDelta,
          undoOfId: operationId,
          before: json({ quantity: item.quantity, stockVersion: item.stockVersion }),
          after: json({ quantity: updated.quantity, stockVersion: updated.stockVersion }),
          eventPayload: json({ item: data, delta: inverseDelta, undoOf: operationId }),
        };
      }

      if (original.kind === OperationKind.ITEM_DELETED) {
        const initial = await tx.item.findFirst({
          where: { id: original.aggregateId, householdId: DEFAULT_HOUSEHOLD_ID },
        });
        if (!initial || !initial.deletedAt) {
          throw new ApiError(409, "UNDO_CONFLICT", "アイテムを復元できません。");
        }
        const category = await lockCategory(tx, initial.categoryId);
        const item = await lockItem(tx, initial.id, true);
        const duplicate = await tx.item.findFirst({
          where: {
            householdId: DEFAULT_HOUSEHOLD_ID,
            categoryId: item.categoryId,
            nameKey: item.nameKey,
            deletedAt: null,
            id: { not: item.id },
          },
        });
        if (duplicate) {
          throw new ApiError(409, "UNDO_NAME_CONFLICT", "同名アイテムがあるため復元できません。");
        }

        const active = await tx.item.findMany({
          where: { categoryId: item.categoryId, deletedAt: null },
          orderBy: [{ position: "asc" }, { id: "asc" }],
          select: { id: true, position: true },
        });
        const insertionIndex = active.filter((candidate) => candidate.position < item.position).length;
        const orderedIds = active.map((candidate) => candidate.id);
        orderedIds.splice(insertionIndex, 0, item.id);
        const restored = await tx.item.update({
          where: { id: item.id },
          data: { deletedAt: null, metadataVersion: { increment: 1 } },
        });
        for (const [index, itemId] of orderedIds.entries()) {
          await tx.item.update({
            where: { id: itemId },
            data: { position: (index + 1) * SORT_POSITION_GAP },
          });
        }
        const categoryAfter = await tx.category.update({
          where: { id: category.id },
          data: { itemsOrderVersion: { increment: 1 } },
          select: { itemsOrderVersion: true },
        });
        await tx.operation.update({ where: { id: operationId }, data: { undoneAt: now } });
        const finalItem = { ...restored, position: (insertionIndex + 1) * SORT_POSITION_GAP };
        const data = toItem(finalItem);
        return {
          kind: OperationKind.ITEM_RESTORED,
          aggregateType: "item",
          aggregateId: item.id,
          data,
          undoOfId: operationId,
          after: json(data),
          eventPayload: json({ item: data, itemsOrderVersion: categoryAfter.itemsOrderVersion, undoOf: operationId }),
        };
      }

      throw new ApiError(409, "UNDO_NOT_SUPPORTED", "この操作は取り消せません。");
    });
  } catch (error) {
    if (error instanceof ApiError && error.code === "ALREADY_UNDONE") {
      const completed = await getDb().operation.findUnique({
        where: { id: operationId },
        include: { undoneBy: true },
      });
      if (completed?.undoneBy?.responsePayload) {
        return completed.undoneBy.responsePayload as unknown as MutationResult<InventoryItem>;
      }
    }
    throw error;
  }
}
