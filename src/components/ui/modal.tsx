"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";

import { Icon } from "./icon";

type ModalProps = {
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  onClose: () => void;
  closeLabel?: string;
  back?: boolean;
};

export function Modal({ title, children, footer, onClose, closeLabel = "閉じる", back = false }: ModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
    return () => {
      if (dialog?.open) dialog.close();
    };
  }, []);

  return (
    <dialog
      ref={dialogRef}
      className="modal"
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.currentTarget === event.target) onClose();
      }}
    >
      <div className="modal-shell">
        <header className="modal-header">
          <h2 className="modal-title" id={titleId}>
            {title}
          </h2>
          <button className="icon-button button-quiet" type="button" onClick={onClose} aria-label={closeLabel}>
            <Icon name={back ? "back" : "close"} />
          </button>
        </header>
        <div className="modal-body">{children}</div>
        {footer ? <footer className="modal-footer">{footer}</footer> : null}
      </div>
    </dialog>
  );
}
