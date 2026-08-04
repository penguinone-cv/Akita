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
import type { InventoryItem } from "@/lib/contracts";

type ItemReorderListProps = {
  items: InventoryItem[];
  saving: boolean;
  onReorder: (orderedIds: string[]) => void;
};

function SortableItemRow({ item, disabled }: { item: InventoryItem; disabled: boolean }) {
  const { attributes, listeners, setActivatorNodeRef, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item.id,
    disabled,
  });
  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div ref={setNodeRef} className={`sort-row${isDragging ? " is-dragging" : ""}`} style={style}>
      <button
        ref={setActivatorNodeRef}
        className="drag-handle"
        type="button"
        aria-label={`${item.name}を並べ替える`}
        disabled={disabled}
        {...attributes}
        {...listeners}
      >
        <Icon name="grip" />
      </button>
      <span className="sort-name">{item.name}</span>
      <span className="sort-count">{item.quantity} 個</span>
    </div>
  );
}

export function ItemReorderList({ items, saving, onReorder }: ItemReorderListProps) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const from = items.findIndex((item) => item.id === active.id);
    const to = items.findIndex((item) => item.id === over.id);
    if (from < 0 || to < 0) return;
    onReorder(arrayMove(items, from, to).map((item) => item.id));
  }

  return (
    <>
      <div className="reorder-callout">
        <Icon name="grip" />
        ハンドルをドラッグして並び順を変更できます。
      </div>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={items.map((item) => item.id)} strategy={verticalListSortingStrategy}>
          <div className="sort-list" aria-busy={saving}>
            {items.map((item) => (
              <SortableItemRow key={item.id} item={item} disabled={saving} />
            ))}
          </div>
        </SortableContext>
      </DndContext>
    </>
  );
}
