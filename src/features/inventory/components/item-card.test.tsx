import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { InventoryItem } from "@/lib/contracts";

import { ItemCard } from "./item-card";

const item: InventoryItem = {
  id: "item-1",
  categoryId: "category-1",
  name: "トイレットペーパー",
  quantity: 3,
  position: 0,
  metadataVersion: 1,
  stockVersion: 2,
};

afterEach(cleanup);

function renderCard(
  overrides: Partial<React.ComponentProps<typeof ItemCard>> = {},
) {
  const props: React.ComponentProps<typeof ItemCard> = {
    item,
    menuOpen: false,
    busy: false,
    zeroFeedback: false,
    onToggleMenu: vi.fn(),
    onAdjust: vi.fn(),
    onEdit: vi.fn(),
    onDelete: vi.fn(),
    ...overrides,
  };

  return { ...render(<ItemCard {...props} />), props };
}

describe("ItemCard", () => {
  it("maps the left and right controls to -1 and +1", async () => {
    const user = userEvent.setup();
    const { props } = renderCard();

    await user.click(
      screen.getByRole("button", { name: "トイレットペーパーを1減らす" }),
    );
    await user.click(
      screen.getByRole("button", { name: "トイレットペーパーを1増やす" }),
    );

    expect(props.onAdjust).toHaveBeenNthCalledWith(1, -1);
    expect(props.onAdjust).toHaveBeenNthCalledWith(2, 1);
  });

  it("shows zero-stock feedback and the current quantity", () => {
    const { container } = renderCard({
      item: { ...item, quantity: 0 },
      zeroFeedback: true,
    });

    expect(screen.getByText("在庫切れ")).toBeInTheDocument();
    expect(screen.getByLabelText("現在の在庫 0個")).toHaveTextContent("0個");
    expect(container.querySelector("[data-item-card='item-1']")).toHaveClass(
      "is-zero",
      "is-bump",
    );
  });

  it("opens the item menu and dispatches edit and delete actions", async () => {
    const user = userEvent.setup();
    const callbacks = {
      onToggleMenu: vi.fn(),
      onAdjust: vi.fn(),
      onEdit: vi.fn(),
      onDelete: vi.fn(),
    };
    const { rerender } = renderCard(callbacks);

    await user.click(
      screen.getByRole("button", { name: "トイレットペーパーのメニュー" }),
    );
    expect(callbacks.onToggleMenu).toHaveBeenCalledTimes(1);

    rerender(
      <ItemCard
        item={item}
        menuOpen
        busy={false}
        zeroFeedback={false}
        {...callbacks}
      />,
    );
    await user.click(screen.getByRole("menuitem", { name: /編集/ }));
    expect(callbacks.onToggleMenu).toHaveBeenCalledTimes(2);
    expect(callbacks.onEdit).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole("menuitem", { name: /削除/ }));
    expect(callbacks.onToggleMenu).toHaveBeenCalledTimes(3);
    expect(callbacks.onDelete).toHaveBeenCalledTimes(1);
  });

  it("disables all card controls while an update is in progress", () => {
    renderCard({ busy: true });

    expect(
      screen.getByRole("button", { name: "トイレットペーパーを1減らす" }),
    ).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "トイレットペーパーを1増やす" }),
    ).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "トイレットペーパーのメニュー" }),
    ).toBeDisabled();
  });
});
