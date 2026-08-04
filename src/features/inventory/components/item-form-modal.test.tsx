import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import type { InventoryCategory } from "@/lib/contracts";

import { ItemFormModal } from "./item-form-modal";

const categories: InventoryCategory[] = [
  {
    id: "category-pantry",
    name: "食品",
    position: 0,
    isSystem: false,
    metadataVersion: 1,
    itemsOrderVersion: 1,
  },
  {
    id: "category-daily",
    name: "日用品",
    position: 1,
    isSystem: false,
    metadataVersion: 1,
    itemsOrderVersion: 1,
  },
];

const originalShowModal = HTMLDialogElement.prototype.showModal;
const originalClose = HTMLDialogElement.prototype.close;

afterEach(cleanup);

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function showModal() {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function close() {
    this.removeAttribute("open");
  };
});

afterAll(() => {
  HTMLDialogElement.prototype.showModal = originalShowModal;
  HTMLDialogElement.prototype.close = originalClose;
});

function renderForm(onSubmit = vi.fn().mockResolvedValue(undefined)) {
  const result = render(
    <ItemFormModal
      item={null}
      items={[]}
      categories={categories}
      initialCategoryId="category-pantry"
      onClose={vi.fn()}
      onSubmit={onSubmit}
    />,
  );
  return { ...result, onSubmit };
}

describe("ItemFormModal", () => {
  it("submits a directly entered stock quantity", async () => {
    const user = userEvent.setup();
    const { onSubmit, container } = renderForm();

    await user.type(screen.getByLabelText("アイテム名"), "  洗剤  ");
    await user.selectOptions(screen.getByLabelText("カテゴリ"), "category-daily");
    await user.clear(screen.getByLabelText("在庫数"));
    await user.type(screen.getByLabelText("在庫数"), "12");
    fireEvent.submit(container.querySelector("#item-form")!);

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith({
        name: "洗剤",
        categoryId: "category-daily",
        quantity: 12,
      });
    });
  });

  it.each(["-1", "1.5", ""])(
    "rejects an invalid direct quantity: %j",
    async (quantity) => {
      const user = userEvent.setup();
      const { onSubmit, container } = renderForm();

      await user.type(screen.getByLabelText("アイテム名"), "牛乳");
      await user.clear(screen.getByLabelText("在庫数"));
      if (quantity) await user.type(screen.getByLabelText("在庫数"), quantity);
      fireEvent.submit(container.querySelector("#item-form")!);

      expect(await screen.findByRole("alert")).toHaveTextContent(
        "在庫数は0以上、2,147,483,647以下の整数で入力してください。",
      );
      expect(onSubmit).not.toHaveBeenCalled();
    },
  );
});
