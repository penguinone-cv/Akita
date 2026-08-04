import type { HTMLAttributes } from "react";

export type IconName =
  | "add"
  | "back"
  | "box"
  | "check"
  | "close"
  | "delete"
  | "edit"
  | "grip"
  | "menu"
  | "reorder"
  | "settings"
  | "warning";

const glyphs: Record<IconName, string> = {
  add: "+",
  back: "←",
  box: "□",
  check: "✓",
  close: "×",
  delete: "⌫",
  edit: "✎",
  grip: "⠿",
  menu: "•••",
  reorder: "↕",
  settings: "⚙",
  warning: "!",
};

export function Icon({ name, className = "", ...props }: { name: IconName } & HTMLAttributes<HTMLSpanElement>) {
  return (
    <span className={`icon ${className}`.trim()} aria-hidden="true" {...props}>
      {glyphs[name]}
    </span>
  );
}
