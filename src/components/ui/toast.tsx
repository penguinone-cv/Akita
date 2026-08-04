"use client";

export type ToastMessage = {
  id: number;
  message: string;
  tone?: "default" | "error";
  actionLabel?: string;
  onAction?: () => void | Promise<void>;
};

export function Toast({ toast }: { toast: ToastMessage | null }) {
  if (!toast) return null;

  return (
    <div className={`toast${toast.tone === "error" ? " toast-error" : ""}`} role="status" aria-live="polite">
      <span>{toast.message}</span>
      {toast.onAction ? (
        <button className="toast-action" type="button" onClick={() => void toast.onAction?.()}>
          {toast.actionLabel ?? "元に戻す"}
        </button>
      ) : null}
    </div>
  );
}
