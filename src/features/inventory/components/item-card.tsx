"use client";

import { Icon } from "@/components/ui/icon";
import type { InventoryItem } from "@/lib/contracts";

type ItemCardProps = {
  item: InventoryItem;
  menuOpen: boolean;
  busy: boolean;
  zeroFeedback: boolean;
  onToggleMenu: () => void;
  onAdjust: (delta: -1 | 1) => void;
  onEdit: () => void;
  onDelete: () => void;
};

export function ItemCard({
  item,
  menuOpen,
  busy,
  zeroFeedback,
  onToggleMenu,
  onAdjust,
  onEdit,
  onDelete,
}: ItemCardProps) {
  const isZero = item.quantity === 0;

  return (
    <article
      className={`item-card${isZero ? " is-zero" : ""}${zeroFeedback ? " is-bump" : ""}`}
      data-item-card={item.id}
    >
      <div className="card-header">
        <div className="card-name-wrap">
          <span className="card-name" title={item.name}>
            {item.name}
          </span>
          {isZero ? <span className="zero-label">在庫切れ</span> : null}
        </div>
        <button
          className="card-menu-button"
          type="button"
          data-menu-trigger
          aria-label={`${item.name}のメニュー`}
          aria-expanded={menuOpen}
          aria-haspopup="menu"
          onClick={onToggleMenu}
          disabled={busy}
        >
          <Icon name="menu" />
        </button>
      </div>

      <div className="card-adjust">
        <button
          className="adjust-button"
          type="button"
          aria-label={`${item.name}を1減らす`}
          onClick={() => onAdjust(-1)}
          disabled={busy}
        >
          <span className="adjust-symbol" aria-hidden="true">
            −
          </span>
          <span className="adjust-label">減らす</span>
        </button>
        <output className="quantity" aria-label={`現在の在庫 ${item.quantity}個`} aria-live="polite">
          <span className="quantity-value">{item.quantity}</span>
          <span className="quantity-unit">個</span>
        </output>
        <button
          className="adjust-button"
          type="button"
          aria-label={`${item.name}を1増やす`}
          onClick={() => onAdjust(1)}
          disabled={busy}
        >
          <span className="adjust-symbol" aria-hidden="true">
            ＋
          </span>
          <span className="adjust-label">増やす</span>
        </button>
      </div>

      {menuOpen ? (
        <div className="item-menu" role="menu" data-item-menu>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              onToggleMenu();
              onEdit();
            }}
          >
            <Icon name="edit" />
            編集
          </button>
          <button
            className="danger-text"
            type="button"
            role="menuitem"
            onClick={() => {
              onToggleMenu();
              onDelete();
            }}
          >
            <Icon name="delete" />
            削除
          </button>
        </div>
      ) : null}
    </article>
  );
}
