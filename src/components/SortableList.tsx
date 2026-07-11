import { useState, type ReactNode } from 'react'
import { reorderByIndex } from '../lib/sortOrder'

type SortableListProps<T extends { id: string }> = {
  items: T[]
  onReorder: (items: T[]) => void | Promise<void>
  renderItem: (item: T, index: number) => ReactNode
  className?: string
  rowClassName?: string
  ariaLabel?: string
}

export default function SortableList<T extends { id: string }>({
  items,
  onReorder,
  renderItem,
  className = '',
  rowClassName = '',
  ariaLabel,
}: SortableListProps<T>) {
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const [overIndex, setOverIndex] = useState<number | null>(null)

  async function finishDrop(toIndex: number) {
    if (dragIndex === null) return

    const fromIndex = dragIndex
    setDragIndex(null)
    setOverIndex(null)

    if (fromIndex === toIndex) return

    await onReorder(reorderByIndex(items, fromIndex, toIndex))
  }

  return (
    <ul className={`admin-sortable-list${className ? ` ${className}` : ''}`} aria-label={ariaLabel}>
      {items.map((item, index) => (
        <li
          key={item.id}
          className={`admin-sortable-row${rowClassName ? ` ${rowClassName}` : ''}${overIndex === index ? ' is-drop-target' : ''}${dragIndex === index ? ' is-dragging' : ''}`}
          onDragOver={(event) => {
            event.preventDefault()
            setOverIndex(index)
          }}
          onDragLeave={() => {
            setOverIndex((current) => (current === index ? null : current))
          }}
          onDrop={(event) => {
            event.preventDefault()
            void finishDrop(index)
          }}
        >
          <button
            type="button"
            className="admin-drag-handle"
            draggable
            aria-label={`Drag to reorder item ${index + 1}`}
            onDragStart={() => setDragIndex(index)}
            onDragEnd={() => {
              setDragIndex(null)
              setOverIndex(null)
            }}
          >
            <span aria-hidden>⠿</span>
          </button>
          {renderItem(item, index)}
        </li>
      ))}
    </ul>
  )
}
