"use client";

import { useState, type ReactNode } from "react";

import { Icon } from "@/components/ui/icon";
import { Modal } from "@/components/ui/modal";

type ConfirmModalProps = {
  title: string;
  children: ReactNode;
  confirmLabel?: string;
  onClose: () => void;
  onConfirm: () => Promise<string | void>;
};

export function ConfirmModal({
  title,
  children,
  confirmLabel = "削除",
  onClose,
  onConfirm,
}: ConfirmModalProps) {
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function confirm() {
    setSaving(true);
    setError("");
    try {
      const message = await onConfirm();
      if (message) setError(message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      title={title}
      onClose={onClose}
      footer={
        <>
          <button className="button" type="button" onClick={onClose} disabled={saving}>
            キャンセル
          </button>
          <button className="button button-danger" type="button" onClick={() => void confirm()} disabled={saving}>
            {saving ? "処理中…" : confirmLabel}
          </button>
        </>
      }
    >
      <div className="confirm-mark" aria-hidden="true">
        <Icon name="delete" />
      </div>
      <div className="confirm-copy">{children}</div>
      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}
    </Modal>
  );
}
