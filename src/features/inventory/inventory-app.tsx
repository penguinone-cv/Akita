"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Icon } from "@/components/ui/icon";
import { Toast, type ToastMessage } from "@/components/ui/toast";
import type {
  InventoryCategory,
  InventoryItem,
  InventorySnapshot,
  MutationResult,
  UndoTicket,
} from "@/lib/contracts";

import {
  InventoryApiError,
  addCategory,
  addItem,
  adjustItemStock,
  getInventory,
  removeCategory,
  removeItem,
  renameCategory,
  saveCategoryOrder,
  saveItemOrder,
  setItemStock,
  undoOperation,
  updateItemMetadata,
} from "./api-client";
import { CategoryFormModal } from "./components/category-form-modal";
import { CategoryManagerModal } from "./components/category-manager-modal";
import { ConfirmModal } from "./components/confirm-modal";
import { ItemCard } from "./components/item-card";
import { ItemFormModal, type ItemFormValues } from "./components/item-form-modal";
import { ItemReorderList } from "./components/item-reorder-list";
import { useInventoryEvents, type RealtimeStatus } from "./hooks/use-inventory-events";

type DialogState =
  | { kind: "item-form"; itemId: string | null }
  | { kind: "delete-item"; itemId: string }
  | { kind: "categories" }
  | { kind: "category-form"; categoryId: string | null }
  | { kind: "delete-category"; categoryId: string }
  | null;

const ALL_CATEGORIES = "all";

function sortCategories(categories: InventoryCategory[]): InventoryCategory[] {
  return [...categories].sort((left, right) => {
    if (left.isSystem !== right.isSystem) return left.isSystem ? 1 : -1;
    return left.position - right.position || left.name.localeCompare(right.name, "ja");
  });
}

function sortItems(items: InventoryItem[]): InventoryItem[] {
  return [...items].sort((left, right) => left.position - right.position || left.name.localeCompare(right.name, "ja"));
}

function messageForError(error: unknown): string {
  if (error instanceof InventoryApiError) {
    const concurrentChangeCodes = new Set([
      "CATEGORY_CHANGED",
      "CATEGORY_ORDER_CHANGED",
      "ITEM_CHANGED",
      "ITEM_ORDER_CHANGED",
      "STOCK_CHANGED",
    ]);
    if (concurrentChangeCodes.has(error.code)) {
      return "ほかの端末で変更されたため、最新の状態を読み込みました。もう一度お試しください。";
    }
    return error.message;
  }
  if (error instanceof TypeError) return "サーバーに接続できませんでした。通信状態を確認してください。";
  return "処理に失敗しました。もう一度お試しください。";
}

function syncCopy(status: RealtimeStatus): { label: string; className: string } {
  if (status === "connected") return { label: "家族と同期済み", className: "" };
  if (status === "offline") return { label: "オフライン", className: " is-offline" };
  if (status === "reconnecting") return { label: "再接続中…", className: " is-reconnecting" };
  return { label: "同期を確認中…", className: " is-reconnecting" };
}

function remainingUndoTime(expiresAt: string): number {
  return Math.max(0, Date.parse(expiresAt) - Date.now());
}

export function InventoryApp() {
  const [snapshot, setSnapshot] = useState<InventorySnapshot | null>(null);
  const [initialLoading, setInitialLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [notice, setNotice] = useState("");
  const [activeCategoryId, setActiveCategoryId] = useState(ALL_CATEGORIES);
  const [reorderMode, setReorderMode] = useState(false);
  const [savingOrder, setSavingOrder] = useState(false);
  const [categorySaving, setCategorySaving] = useState(false);
  const [busyItems, setBusyItems] = useState<Set<string>>(() => new Set());
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [dialog, setDialog] = useState<DialogState>(null);
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const [zeroFeedbackId, setZeroFeedbackId] = useState<string | null>(null);
  const [realtimeStatus, setRealtimeStatus] = useState<RealtimeStatus>("connecting");

  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const zeroTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const refreshSequenceRef = useRef(0);
  const hasLoadedRef = useRef(false);

  const refreshInventory = useCallback(async (silent = true) => {
    const requestSequence = ++refreshSequenceRef.current;
    try {
      const latest = await getInventory();
      if (requestSequence !== refreshSequenceRef.current) return false;
      setSnapshot(latest);
      hasLoadedRef.current = true;
      setInitialLoading(false);
      setLoadError("");
      setNotice("");
      return true;
    } catch (error) {
      if (requestSequence !== refreshSequenceRef.current) return false;
      const message = messageForError(error);
      if (!hasLoadedRef.current && !silent) {
        setLoadError(message);
        setInitialLoading(false);
      } else {
        setNotice(message);
      }
      return false;
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const requestSequence = ++refreshSequenceRef.current;
    void getInventory(controller.signal)
      .then((latest) => {
        if (controller.signal.aborted || requestSequence !== refreshSequenceRef.current) return;
        setSnapshot(latest);
        hasLoadedRef.current = true;
        setInitialLoading(false);
        setLoadError("");
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted || requestSequence !== refreshSequenceRef.current) return;
        setLoadError(messageForError(error));
        setInitialLoading(false);
      });
    return () => {
      controller.abort();
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
      if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
      if (zeroTimerRef.current) clearTimeout(zeroTimerRef.current);
    };
  }, [refreshInventory]);

  const scheduleRefresh = useCallback(() => {
    if (refreshTimerRef.current) return;
    refreshTimerRef.current = setTimeout(() => {
      refreshTimerRef.current = null;
      void refreshInventory(true);
    }, 90);
  }, [refreshInventory]);

  useInventoryEvents({
    enabled: snapshot !== null,
    lastEventSeq: snapshot?.lastEventSeq ?? "",
    onEvent: scheduleRefresh,
    onReconnect: scheduleRefresh,
    onStatusChange: setRealtimeStatus,
  });

  useEffect(() => {
    function closeMenu(event: PointerEvent) {
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (!target.closest("[data-item-menu], [data-menu-trigger]")) setOpenMenuId(null);
    }
    document.addEventListener("pointerdown", closeMenu);
    return () => document.removeEventListener("pointerdown", closeMenu);
  }, []);

  const categories = useMemo(() => sortCategories(snapshot?.categories ?? []), [snapshot?.categories]);
  const items = useMemo(() => sortItems(snapshot?.items ?? []), [snapshot?.items]);
  const activeCategory =
    activeCategoryId === ALL_CATEGORIES
      ? null
      : categories.find((category) => category.id === activeCategoryId) ?? null;
  const effectiveCategoryId = activeCategory ? activeCategory.id : ALL_CATEGORIES;
  const visibleItems = activeCategory ? items.filter((item) => item.categoryId === activeCategory.id) : items;
  const isReorderMode = reorderMode && activeCategory !== null;

  const showToast = useCallback((next: Omit<ToastMessage, "id">, duration = 5000) => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    const id = Date.now();
    setToast({ id, ...next });
    toastTimerRef.current = setTimeout(() => {
      setToast((current) => (current?.id === id ? null : current));
      toastTimerRef.current = null;
    }, duration);
  }, []);

  async function performUndo(ticket: UndoTicket) {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToast(null);
    try {
      await undoOperation(ticket.operationId, ticket.token);
      await refreshInventory(true);
      showToast({ message: "変更を元に戻しました" });
    } catch (error) {
      await refreshInventory(true);
      showToast({ message: messageForError(error), tone: "error" });
    }
  }

  function notifyMutation(message: string, result: MutationResult<unknown>) {
    if (result.undo) {
      const ticket = result.undo;
      const remaining = remainingUndoTime(ticket.expiresAt);
      if (remaining <= 0) {
        showToast({ message });
        return;
      }
      showToast({
        message,
        actionLabel: "元に戻す",
        onAction: () => performUndo(ticket),
      }, remaining);
      return;
    }
    showToast({ message });
  }

  function applyItem(item: InventoryItem, lastEventSeq: string) {
    setSnapshot((current) => {
      if (!current) return current;
      const exists = current.items.some((candidate) => candidate.id === item.id);
      return {
        ...current,
        lastEventSeq,
        items: exists
          ? current.items.map((candidate) => (candidate.id === item.id ? item : candidate))
          : [...current.items, item],
      };
    });
  }

  function applyCategory(category: InventoryCategory, lastEventSeq: string) {
    setSnapshot((current) => {
      if (!current) return current;
      const exists = current.categories.some((candidate) => candidate.id === category.id);
      return {
        ...current,
        lastEventSeq,
        categories: exists
          ? current.categories.map((candidate) => (candidate.id === category.id ? category : candidate))
          : [...current.categories, category],
      };
    });
  }

  function setItemBusy(itemId: string, busy: boolean) {
    setBusyItems((current) => {
      const next = new Set(current);
      if (busy) next.add(itemId);
      else next.delete(itemId);
      return next;
    });
  }

  function showZeroFeedback(itemId: string) {
    if (zeroTimerRef.current) clearTimeout(zeroTimerRef.current);
    setZeroFeedbackId(itemId);
    zeroTimerRef.current = setTimeout(() => setZeroFeedbackId(null), 520);
    showToast({ message: "在庫数は0未満にできません" });
  }

  async function handleAdjust(item: InventoryItem, delta: -1 | 1) {
    if (delta === -1 && item.quantity === 0) {
      showZeroFeedback(item.id);
      return;
    }

    setOpenMenuId(null);
    setItemBusy(item.id, true);
    setSnapshot((current) =>
      current
        ? {
            ...current,
            items: current.items.map((candidate) =>
              candidate.id === item.id ? { ...candidate, quantity: candidate.quantity + delta } : candidate,
            ),
          }
        : current,
    );

    try {
      const result = await adjustItemStock(item.id, delta);
      applyItem(result.data, result.lastEventSeq);
      notifyMutation(`${item.name}を1${delta > 0 ? "増やしました" : "減らしました"}`, result);
    } catch (error) {
      await refreshInventory(true);
      if (
        error instanceof InventoryApiError &&
        (error.code === "QUANTITY_AT_MINIMUM" || error.code.includes("UNDERFLOW") || error.code.includes("NON_NEGATIVE"))
      ) {
        showZeroFeedback(item.id);
      } else {
        showToast({ message: messageForError(error), tone: "error" });
      }
    } finally {
      setItemBusy(item.id, false);
    }
  }

  function initialCategoryForItem(): string {
    if (activeCategory) return activeCategory.id;
    return categories.find((category) => category.isSystem)?.id ?? categories[0]?.id ?? "";
  }

  async function handleSaveItem(item: InventoryItem | null, values: ItemFormValues): Promise<string | void> {
    if (!item) {
      try {
        const result = await addItem(values);
        applyItem(result.data, result.lastEventSeq);
        setDialog(null);
        showToast({ message: `${result.data.name}を追加しました` });
        return;
      } catch (error) {
        await refreshInventory(true);
        return messageForError(error);
      }
    }

    const metadataChanged = item.name !== values.name || item.categoryId !== values.categoryId;
    const stockChanged = item.quantity !== values.quantity;
    if (!metadataChanged && !stockChanged) {
      setDialog(null);
      showToast({ message: "変更はありません" });
      return;
    }

    let currentItem = item;
    let metadataSaved = false;
    let stockResult: MutationResult<InventoryItem> | null = null;
    try {
      if (metadataChanged) {
        const result = await updateItemMetadata(currentItem, {
          name: values.name,
          categoryId: values.categoryId,
        });
        currentItem = result.data;
        metadataSaved = true;
        applyItem(result.data, result.lastEventSeq);
      }
      if (stockChanged) {
        stockResult = await setItemStock(currentItem, values.quantity);
        currentItem = stockResult.data;
        applyItem(stockResult.data, stockResult.lastEventSeq);
      }
      setDialog(null);
      if (stockResult) {
        notifyMutation(
          metadataSaved
            ? `${currentItem.name}を更新しました（元に戻せるのは在庫数のみ）`
            : `${currentItem.name}の在庫数を更新しました`,
          stockResult,
        );
      }
      else showToast({ message: `${currentItem.name}を更新しました` });
      return;
    } catch (error) {
      await refreshInventory(true);
      if (metadataSaved && stockChanged) {
        return `名前・カテゴリは保存されましたが、在庫数を更新できませんでした。${messageForError(error)}`;
      }
      return messageForError(error);
    }
  }

  async function handleDeleteItem(item: InventoryItem): Promise<string | void> {
    setItemBusy(item.id, true);
    try {
      const result = await removeItem(item);
      setSnapshot((current) =>
        current
          ? {
              ...current,
              lastEventSeq: result.lastEventSeq,
              items: current.items.filter((candidate) => candidate.id !== item.id),
            }
          : current,
      );
      setDialog(null);
      notifyMutation(`${item.name}を削除しました`, result);
      return;
    } catch (error) {
      await refreshInventory(true);
      return messageForError(error);
    } finally {
      setItemBusy(item.id, false);
    }
  }

  async function handleSaveCategory(category: InventoryCategory | null, name: string): Promise<string | void> {
    setCategorySaving(true);
    try {
      const result = category ? await renameCategory(category, name) : await addCategory(name);
      applyCategory(result.data, result.lastEventSeq);
      setDialog({ kind: "categories" });
      showToast({ message: category ? "カテゴリ名を変更しました" : `${result.data.name}を追加しました` });
      return;
    } catch (error) {
      await refreshInventory(true);
      return messageForError(error);
    } finally {
      setCategorySaving(false);
    }
  }

  async function handleDeleteCategory(category: InventoryCategory): Promise<string | void> {
    const itemCount = items.filter((item) => item.categoryId === category.id).length;
    if (category.isSystem || itemCount > 0) return "使用中または既定のカテゴリは削除できません。";

    setCategorySaving(true);
    try {
      const result = await removeCategory(category);
      setSnapshot((current) =>
        current
          ? {
              ...current,
              lastEventSeq: result.lastEventSeq,
              categories: current.categories.filter((candidate) => candidate.id !== category.id),
            }
          : current,
      );
      if (activeCategoryId === category.id) setActiveCategoryId(ALL_CATEGORIES);
      setDialog({ kind: "categories" });
      showToast({ message: `${category.name}を削除しました` });
      return;
    } catch (error) {
      await refreshInventory(true);
      return messageForError(error);
    } finally {
      setCategorySaving(false);
    }
  }

  async function handleCategoryReorder(orderedIds: string[]) {
    if (!snapshot || savingOrder) return;
    const categoryMap = new Map(snapshot.categories.map((category) => [category.id, category]));
    const optimistic = orderedIds
      .map((id, position) => {
        const category = categoryMap.get(id);
        return category ? { ...category, position } : null;
      })
      .filter((category): category is InventoryCategory => category !== null);
    if (optimistic.length !== snapshot.categories.length) return;

    setSavingOrder(true);
    setSnapshot({ ...snapshot, categories: optimistic });
    try {
      const result = await saveCategoryOrder(orderedIds, snapshot.categoryOrderVersion);
      setSnapshot((current) =>
        current
          ? {
              ...current,
              lastEventSeq: result.lastEventSeq,
              categoryOrderVersion: result.data.orderVersion,
            }
          : current,
      );
      showToast({ message: "カテゴリの並び順を保存しました" });
    } catch (error) {
      await refreshInventory(true);
      showToast({ message: messageForError(error), tone: "error" });
    } finally {
      setSavingOrder(false);
    }
  }

  async function handleItemReorder(orderedIds: string[]) {
    if (!snapshot || !activeCategory || savingOrder) return;
    const itemMap = new Map(snapshot.items.map((item) => [item.id, item]));
    const reordered = orderedIds
      .map((id, position) => {
        const item = itemMap.get(id);
        return item ? { ...item, position } : null;
      })
      .filter((item): item is InventoryItem => item !== null);
    if (reordered.length !== visibleItems.length) return;

    setSavingOrder(true);
    const reorderedMap = new Map(reordered.map((item) => [item.id, item]));
    setSnapshot({
      ...snapshot,
      items: snapshot.items.map((item) => reorderedMap.get(item.id) ?? item),
    });
    try {
      const result = await saveItemOrder(activeCategory, orderedIds);
      setSnapshot((current) =>
        current
          ? {
              ...current,
              lastEventSeq: result.lastEventSeq,
              categories: current.categories.map((category) =>
                category.id === activeCategory.id
                  ? { ...category, itemsOrderVersion: result.data.orderVersion }
                  : category,
              ),
            }
          : current,
      );
      showToast({ message: "並び順を保存しました" });
    } catch (error) {
      await refreshInventory(true);
      showToast({ message: messageForError(error), tone: "error" });
    } finally {
      setSavingOrder(false);
    }
  }

  function selectCategory(categoryId: string) {
    setActiveCategoryId(categoryId);
    setReorderMode(false);
    setOpenMenuId(null);
  }

  function renderInventoryBody() {
    if (initialLoading) {
      return (
        <div className="loading-grid" aria-busy="true" aria-label="在庫を読み込んでいます">
          <div className="skeleton skeleton-card" />
          <div className="skeleton skeleton-card" />
          <div className="skeleton skeleton-card" />
        </div>
      );
    }

    if (!snapshot && loadError) {
      return (
        <div className="load-error-state" role="alert">
          <div>
            <div className="state-icon" aria-hidden="true">
              <Icon name="warning" />
            </div>
            <h2>在庫を読み込めませんでした</h2>
            <p>{loadError}</p>
            <button className="button button-primary" type="button" onClick={() => void refreshInventory(false)}>
              もう一度試す
            </button>
          </div>
        </div>
      );
    }

    if (!snapshot) return null;

    if (visibleItems.length === 0) {
      const title = activeCategory ? `${activeCategory.name}にはアイテムがありません` : "まだアイテムがありません";
      return (
        <div className="empty-state">
          <div>
            <div className="state-icon" aria-hidden="true">
              <Icon name="box" />
            </div>
            <h3>{title}</h3>
            <p>＋ボタンから最初のアイテムを追加できます。</p>
            <button
              className="button button-primary"
              type="button"
              onClick={() => setDialog({ kind: "item-form", itemId: null })}
              disabled={categories.length === 0}
            >
              <Icon name="add" />
              アイテムを追加
            </button>
          </div>
        </div>
      );
    }

    if (isReorderMode && activeCategory) {
      return <ItemReorderList items={visibleItems} saving={savingOrder} onReorder={(ids) => void handleItemReorder(ids)} />;
    }

    if (activeCategory) {
      return (
        <div className="item-grid">
          {visibleItems.map((item) => (
            <ItemCard
              key={item.id}
              item={item}
              menuOpen={openMenuId === item.id}
              busy={busyItems.has(item.id)}
              zeroFeedback={zeroFeedbackId === item.id}
              onToggleMenu={() => setOpenMenuId((current) => (current === item.id ? null : item.id))}
              onAdjust={(delta) => void handleAdjust(item, delta)}
              onEdit={() => setDialog({ kind: "item-form", itemId: item.id })}
              onDelete={() => setDialog({ kind: "delete-item", itemId: item.id })}
            />
          ))}
        </div>
      );
    }

    return categories.map((category) => {
      const categoryItems = items.filter((item) => item.categoryId === category.id);
      if (categoryItems.length === 0) return null;
      return (
        <section className="inventory-section" key={category.id} aria-labelledby={`section-${category.id}`}>
          <h3 className="section-heading" id={`section-${category.id}`}>
            <span>{category.name}</span>
            <span>{categoryItems.length}件</span>
          </h3>
          <div className="item-grid">
            {categoryItems.map((item) => (
              <ItemCard
                key={item.id}
                item={item}
                menuOpen={openMenuId === item.id}
                busy={busyItems.has(item.id)}
                zeroFeedback={zeroFeedbackId === item.id}
                onToggleMenu={() => setOpenMenuId((current) => (current === item.id ? null : item.id))}
                onAdjust={(delta) => void handleAdjust(item, delta)}
                onEdit={() => setDialog({ kind: "item-form", itemId: item.id })}
                onDelete={() => setDialog({ kind: "delete-item", itemId: item.id })}
              />
            ))}
          </div>
        </section>
      );
    });
  }

  const sync = syncCopy(realtimeStatus);
  const dialogItem =
    dialog?.kind === "item-form" && dialog.itemId ? items.find((item) => item.id === dialog.itemId) ?? null : null;
  const deleteItemTarget =
    dialog?.kind === "delete-item" ? items.find((item) => item.id === dialog.itemId) ?? null : null;
  const dialogCategory =
    dialog?.kind === "category-form" && dialog.categoryId
      ? categories.find((category) => category.id === dialog.categoryId) ?? null
      : null;
  const deleteCategoryTarget =
    dialog?.kind === "delete-category"
      ? categories.find((category) => category.id === dialog.categoryId) ?? null
      : null;

  return (
    <main className="app-shell">
      <section className="inventory-app" aria-label="家庭用在庫管理">
        <div className="app-top">
          <header className="app-header">
            <div className="brand">
              <h1 className="brand-name">家の在庫</h1>
              <div className="sync-note" aria-live="polite">
                <span className={`sync-dot${sync.className}`} aria-hidden="true" />
                {sync.label}
              </div>
            </div>
            <div className="header-actions">
              <button
                className="button button-primary"
                type="button"
                aria-label="アイテムを追加"
                onClick={() => setDialog({ kind: "item-form", itemId: null })}
                disabled={!snapshot || categories.length === 0}
              >
                <Icon name="add" />
                <span className="button-label">追加</span>
              </button>
              <button
                className="icon-button"
                type="button"
                aria-label="カテゴリを管理"
                onClick={() => setDialog({ kind: "categories" })}
                disabled={!snapshot}
              >
                <Icon name="settings" />
              </button>
            </div>
          </header>

          <nav className="category-tabs" role="tablist" aria-label="カテゴリ">
            <button
              className="category-tab"
              type="button"
              role="tab"
              id="tab-all"
              aria-controls="inventory-panel"
              aria-selected={effectiveCategoryId === ALL_CATEGORIES}
              onClick={() => selectCategory(ALL_CATEGORIES)}
            >
              すべて
            </button>
            {categories.map((category) => (
              <button
                className="category-tab"
                type="button"
                role="tab"
                id={`tab-${category.id}`}
                aria-controls="inventory-panel"
                aria-selected={effectiveCategoryId === category.id}
                key={category.id}
                onClick={() => selectCategory(category.id)}
              >
                {category.name}
              </button>
            ))}
          </nav>
        </div>

        <div
          className="app-main"
          id="inventory-panel"
          role="tabpanel"
          aria-labelledby={`tab-${effectiveCategoryId}`}
        >
          {notice ? (
            <div className="notice-banner" role="alert">
              <p>{notice}</p>
              <button type="button" onClick={() => setNotice("")} aria-label="通知を閉じる">
                閉じる
              </button>
            </div>
          ) : null}

          <div className="content-header">
            <div>
              <h2 className="content-title">{activeCategory ? activeCategory.name : "すべての在庫"}</h2>
              <div className="content-count">{visibleItems.length}件のアイテム</div>
            </div>
            <button
              className={`button${isReorderMode ? " button-primary" : ""}`}
              type="button"
              onClick={() => {
                setReorderMode((current) => !current);
                setOpenMenuId(null);
              }}
              disabled={!activeCategory || visibleItems.length < 2 || savingOrder}
              title={!activeCategory ? "カテゴリを選択すると並べ替えられます" : undefined}
            >
              <Icon name={isReorderMode ? "check" : "reorder"} />
              {isReorderMode ? "完了" : "並べ替え"}
            </button>
          </div>

          {renderInventoryBody()}
        </div>

        <Toast toast={toast} />

        {dialog?.kind === "item-form" && (dialog.itemId === null || dialogItem) ? (
          <ItemFormModal
            key={`item-${dialog.itemId ?? "new"}`}
            item={dialogItem}
            items={items}
            categories={categories}
            initialCategoryId={initialCategoryForItem()}
            onClose={() => setDialog(null)}
            onSubmit={(values) => handleSaveItem(dialogItem, values)}
          />
        ) : null}

        {dialog?.kind === "delete-item" && deleteItemTarget ? (
          <ConfirmModal
            title="アイテムを削除"
            onClose={() => setDialog(null)}
            onConfirm={() => handleDeleteItem(deleteItemTarget)}
          >
            <p className="confirm-copy">
              <strong>「{deleteItemTarget.name}」</strong>を削除します。削除後5秒間は元に戻せます。
            </p>
          </ConfirmModal>
        ) : null}

        {dialog?.kind === "categories" && snapshot ? (
          <CategoryManagerModal
            categories={categories}
            items={items}
            saving={savingOrder || categorySaving}
            onClose={() => setDialog(null)}
            onAdd={() => setDialog({ kind: "category-form", categoryId: null })}
            onEdit={(category) => setDialog({ kind: "category-form", categoryId: category.id })}
            onDelete={(category) => setDialog({ kind: "delete-category", categoryId: category.id })}
            onReorder={(ids) => void handleCategoryReorder(ids)}
          />
        ) : null}

        {dialog?.kind === "category-form" && (dialog.categoryId === null || dialogCategory) ? (
          <CategoryFormModal
            key={`category-${dialog.categoryId ?? "new"}`}
            category={dialogCategory}
            categories={categories}
            onBack={() => setDialog({ kind: "categories" })}
            onSubmit={(name) => handleSaveCategory(dialogCategory, name)}
          />
        ) : null}

        {dialog?.kind === "delete-category" && deleteCategoryTarget ? (
          <ConfirmModal
            title="カテゴリを削除"
            onClose={() => setDialog({ kind: "categories" })}
            onConfirm={() => handleDeleteCategory(deleteCategoryTarget)}
          >
            <p className="confirm-copy">
              空のカテゴリ<strong>「{deleteCategoryTarget.name}」</strong>を削除します。
            </p>
          </ConfirmModal>
        ) : null}
      </section>
    </main>
  );
}
