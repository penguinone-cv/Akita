"use client";

import { useState, type FormEvent } from "react";

import { Modal } from "@/components/ui/modal";
import type { InventoryCategory, InventoryItem } from "@/lib/contracts";

export type ItemFormValues = {
  name: string;
  categoryId: string;
  quantity: number;
};

type ItemFormModalProps = {
  item: InventoryItem | null;
  items: InventoryItem[];
  categories: InventoryCategory[];
  initialCategoryId: string;
  onClose: () => void;
  onSubmit: (values: ItemFormValues) => Promise<string | void>;
};

export function ItemFormModal({
  item,
  items,
  categories,
  initialCategoryId,
  onClose,
  onSubmit,
}: ItemFormModalProps) {
  const isEdit = item !== null;
  const [name, setName] = useState(item?.name ?? "");
  const [categoryId, setCategoryId] = useState(item?.categoryId ?? initialCategoryId);
  const [quantity, setQuantity] = useState(String(item?.quantity ?? 0));
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalizedName = name.trim();
    const numberValue = Number(quantity);

    if (!normalizedName) {
      setError("アイテム名を入力してください。");
      return;
    }
    if (!categoryId || !categories.some((category) => category.id === categoryId)) {
      setError("カテゴリを選択してください。");
      return;
    }
    if (
      quantity.trim() === ""
      || !Number.isSafeInteger(numberValue)
      || numberValue < 0
      || numberValue > 2_147_483_647
    ) {
      setError("在庫数は0以上、2,147,483,647以下の整数で入力してください。");
      return;
    }
    const duplicate = items.some(
      (candidate) =>
        candidate.id !== item?.id &&
        candidate.categoryId === categoryId &&
        candidate.name.trim().localeCompare(normalizedName, "ja", { sensitivity: "accent" }) === 0,
    );
    if (duplicate) {
      setError("同じカテゴリに同名のアイテムがあります。");
      return;
    }

    setSaving(true);
    setError("");
    try {
      const message = await onSubmit({ name: normalizedName, categoryId, quantity: numberValue });
      if (message) setError(message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      title={isEdit ? "アイテムを編集" : "アイテムを追加"}
      onClose={onClose}
      footer={
        <>
          <button className="button" type="button" onClick={onClose} disabled={saving}>
            キャンセル
          </button>
          <button className="button button-primary" type="submit" form="item-form" disabled={saving}>
            {saving ? "保存中…" : isEdit ? "保存" : "追加"}
          </button>
        </>
      }
    >
      <form className="form" id="item-form" onSubmit={(event) => void submit(event)} noValidate>
        <label className="field">
          <span className="label">アイテム名</span>
          <input
            className="input"
            name="name"
            maxLength={50}
            autoComplete="off"
            autoFocus
            value={name}
            onChange={(event) => setName(event.target.value)}
            aria-invalid={Boolean(error) || undefined}
            placeholder="例：トイレットペーパー"
          />
        </label>
        <label className="field">
          <span className="label">カテゴリ</span>
          <select
            className="select"
            name="categoryId"
            value={categoryId}
            onChange={(event) => setCategoryId(event.target.value)}
          >
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
          {isEdit ? <span className="field-note">カテゴリを変えると、移動先の末尾へ配置されます。</span> : null}
        </label>
        <label className="field">
          <span className="label">在庫数</span>
          <input
            className="input"
            name="quantity"
            type="number"
            inputMode="numeric"
            min={0}
            max={2_147_483_647}
            step={1}
            value={quantity}
            onChange={(event) => setQuantity(event.target.value)}
            aria-invalid={Boolean(error) || undefined}
          />
        </label>
        {error ? (
          <p className="form-error" role="alert">
            {error}
          </p>
        ) : null}
      </form>
    </Modal>
  );
}
