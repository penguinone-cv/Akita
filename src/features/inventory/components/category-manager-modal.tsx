"use client";

import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { CSSProperties } from "react";

import { Icon } from "@/components/ui/icon";
import { Modal } from "@/components/ui/modal";
import type { InventoryCategory, InventoryItem } from "@/lib/contracts";

type CategoryManagerModalProps = {
  categories: InventoryCategory[];
  items: InventoryItem[];
  saving: boolean;
  onClose: () => void;
  onAdd: () => void;
  onEdit: (category: InventoryCategory) => void;
  onDelete: (category: InventoryCategory) => void;
  onReorder: (orderedIds: string[]) => void;
};

function CategoryRow({
  category,
  itemCount,
  saving,
  sortable,
  onEdit,
  onDelete,
}: {
  category: InventoryCategory;
  itemCount: number;
  saving: boolean;
  sortable: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const { attributes, listeners, setActivatorNodeRef, setNodeRef, transform, transition, isDragging } = useSortable({
    id: category.id,
    disabled: !sortable || saving,
  });
  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
  };
  const deleteBlocked = category.isSystem || itemCount > 0;
  const meta = category.isSystem
    ? "既定カテゴリ・削除できません"
    : itemCount > 0
      ? `${itemCount}件・使用中は削除できません`
      : "0件・削除できます";

  return (
    <div ref={setNodeRef} className={`category-row${isDragging ? " is-dragging" : ""}`} style={style}>
      <button
        ref={setActivatorNodeRef}
        className="drag-handle"
        type="button"
        aria-label={`${category.name}を並べ替える`}
        disabled={!sortable || saving}
        {...attributes}
        {...listeners}
      >
        <Icon name="grip" />
      </button>
      <div className="category-main">
        <div className="category-name">
          {category.name}
          {category.isSystem ? <span className="system-tag">固定</span> : null}
        </div>
        <div className="category-meta">{meta}</div>
      </div>
      <div className="row-actions">
        <button
          className="icon-button"
          type="button"
          aria-label={`${category.name}の名前を変更`}
          title={category.isSystem ? "既定カテゴリの名前は変更できません" : "名前を変更"}
          disabled={category.isSystem || saving}
          onClick={onEdit}
        >
          <Icon name="edit" />
        </button>
        <button
          className="icon-button"
          type="button"
          aria-label={`${category.name}を削除`}
          title={deleteBlocked ? meta : "カテゴリを削除"}
          disabled={deleteBlocked || saving}
          onClick={onDelete}
        >
          <Icon name="delete" />
        </button>
      </div>
    </div>
  );
}

export function CategoryManagerModal({
  categories,
  items,
  saving,
  onClose,
  onAdd,
  onEdit,
  onDelete,
  onReorder,
}: CategoryManagerModalProps) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const movable = categories.filter((category) => !category.isSystem);
  const system = categories.filter((category) => category.isSystem);

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const from = movable.findIndex((category) => category.id === active.id);
    const to = movable.findIndex((category) => category.id === over.id);
    if (from < 0 || to < 0) return;
    const ordered = arrayMove(movable, from, to);
    onReorder([...ordered, ...system].map((category) => category.id));
  }

  return (
    <Modal
      title="カテゴリ管理"
      onClose={onClose}
      footer={
        <button className="button button-primary" type="button" onClick={onAdd} disabled={saving}>
          <Icon name="add" />
          カテゴリを追加
        </button>
      }
    >
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={movable.map((category) => category.id)} strategy={verticalListSortingStrategy}>
          <div className="category-list" aria-busy={saving}>
            {[...movable, ...system].map((category) => (
              <CategoryRow
                key={category.id}
                category={category}
                itemCount={items.filter((item) => item.categoryId === category.id).length}
                saving={saving}
                sortable={!category.isSystem}
                onEdit={() => onEdit(category)}
                onDelete={() => onDelete(category)}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>
      <p className="helper">ハンドルで並べ替えられます。使用中のカテゴリを削除するには、先にアイテムを移動してください。</p>
    </Modal>
  );
}
