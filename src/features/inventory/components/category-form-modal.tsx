"use client";

import { useState, type FormEvent } from "react";

import { Modal } from "@/components/ui/modal";
import type { InventoryCategory } from "@/lib/contracts";

type CategoryFormModalProps = {
  category: InventoryCategory | null;
  categories: InventoryCategory[];
  onBack: () => void;
  onSubmit: (name: string) => Promise<string | void>;
};

export function CategoryFormModal({ category, categories, onBack, onSubmit }: CategoryFormModalProps) {
  const isEdit = category !== null;
  const [name, setName] = useState(category?.name ?? "");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalizedName = name.trim();
    if (!normalizedName) {
      setError("カテゴリ名を入力してください。");
      return;
    }
    const duplicate = categories.some(
      (candidate) =>
        candidate.id !== category?.id &&
        candidate.name.trim().localeCompare(normalizedName, "ja", { sensitivity: "accent" }) === 0,
    );
    if (duplicate) {
      setError("同名のカテゴリがあります。");
      return;
    }

    setSaving(true);
    setError("");
    try {
      const message = await onSubmit(normalizedName);
      if (message) setError(message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      title={isEdit ? "カテゴリ名を変更" : "カテゴリを追加"}
      onClose={onBack}
      closeLabel="カテゴリ管理に戻る"
      back
      footer={
        <>
          <button className="button" type="button" onClick={onBack} disabled={saving}>
            キャンセル
          </button>
          <button className="button button-primary" type="submit" form="category-form" disabled={saving}>
            {saving ? "保存中…" : isEdit ? "保存" : "追加"}
          </button>
        </>
      }
    >
      <form className="form" id="category-form" onSubmit={(event) => void submit(event)} noValidate>
        <label className="field">
          <span className="label">カテゴリ名</span>
          <input
            className="input"
            name="name"
            maxLength={30}
            autoComplete="off"
            autoFocus
            value={name}
            onChange={(event) => setName(event.target.value)}
            aria-invalid={Boolean(error) || undefined}
            placeholder="例：食品庫"
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
