export function reorderByIndex<T>(items: T[], fromIndex: number, toIndex: number): T[] {
  if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0) return items
  if (fromIndex >= items.length || toIndex >= items.length) return items

  const next = [...items]
  const [moved] = next.splice(fromIndex, 1)
  next.splice(toIndex, 0, moved)

  return next
}

export function sortOrderUpdates(ids: string[]): { id: string; sortOrder: number }[] {
  return ids.map((id, index) => ({ id, sortOrder: index + 1 }))
}
