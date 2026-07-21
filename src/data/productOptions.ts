export type ProductOptionChoice = {
  id: string
  label: string
  /** Optional surcharge added to the product price when this choice is selected. */
  priceDeltaCents: number
  /** Optional image shown on the option picker for this choice. */
  imageUrl: string
}

export type ProductOptionGroup = {
  id: string
  name: string
  required: boolean
  choices: ProductOptionChoice[]
}

/** How a product resolves its option groups relative to its product type. */
export type ProductOptionsMode = 'inherit' | 'custom' | 'none'

export type SelectedProductOption = {
  groupId: string
  groupName: string
  choiceId: string
  choiceLabel: string
  priceDeltaCents: number
  imageUrl?: string
}

function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

export function createOptionId(prefix = 'opt'): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 9)}`
}

export function emptyOptionChoice(): ProductOptionChoice {
  return { id: createOptionId('choice'), label: '', priceDeltaCents: 0, imageUrl: '' }
}

export function emptyOptionGroup(): ProductOptionGroup {
  return {
    id: createOptionId('group'),
    name: '',
    required: true,
    choices: [emptyOptionChoice(), emptyOptionChoice()],
  }
}

export function parseOptionGroups(data: unknown): ProductOptionGroup[] {
  if (!Array.isArray(data)) return []

  const groups: ProductOptionGroup[] = []

  for (const item of data) {
    if (!item || typeof item !== 'object') continue
    const record = item as Record<string, unknown>
    const name = typeof record.name === 'string' ? record.name.trim() : ''
    if (!name) continue

    const rawChoices = Array.isArray(record.choices) ? record.choices : []
    const choices: ProductOptionChoice[] = []

    for (const choice of rawChoices) {
      if (!choice || typeof choice !== 'object') continue
      const choiceRecord = choice as Record<string, unknown>
      const label = typeof choiceRecord.label === 'string' ? choiceRecord.label.trim() : ''
      if (!label) continue

      const id =
        typeof choiceRecord.id === 'string' && choiceRecord.id.trim()
          ? choiceRecord.id.trim()
          : slugify(label) || createOptionId('choice')

      choices.push({
        id,
        label,
        priceDeltaCents: Math.round(Number(choiceRecord.priceDeltaCents) || 0),
        imageUrl:
          typeof choiceRecord.imageUrl === 'string' ? choiceRecord.imageUrl.trim() : '',
      })
    }

    if (choices.length === 0) continue

    const id =
      typeof record.id === 'string' && record.id.trim()
        ? record.id.trim()
        : slugify(name) || createOptionId('group')

    groups.push({
      id,
      name,
      required: record.required !== false,
      choices,
    })
  }

  return groups
}

export function serializeOptionGroups(groups: ProductOptionGroup[]): ProductOptionGroup[] {
  return parseOptionGroups(groups)
}

export function parseOptionsMode(value: unknown): ProductOptionsMode {
  if (value === 'custom' || value === 'none' || value === 'inherit') return value
  return 'inherit'
}

export function resolveProductOptionGroups(
  product: { optionsMode?: ProductOptionsMode; optionGroups?: ProductOptionGroup[] },
  productType: { optionGroups?: ProductOptionGroup[] } | null | undefined,
): ProductOptionGroup[] {
  const mode = product.optionsMode ?? 'inherit'
  if (mode === 'none') return []
  if (mode === 'custom') return product.optionGroups ?? []
  return productType?.optionGroups ?? []
}

export function lineKeyForOptions(
  productId: string,
  selected: SelectedProductOption[],
): string {
  if (selected.length === 0) return productId
  const suffix = [...selected]
    .sort((a, b) => a.groupId.localeCompare(b.groupId))
    .map((item) => `${item.groupId}:${item.choiceId}`)
    .join('|')
  return `${productId}__${suffix}`
}

export function optionsPriceDeltaCents(selected: SelectedProductOption[]): number {
  return selected.reduce((sum, item) => sum + (item.priceDeltaCents || 0), 0)
}

export function formatSelectedOptions(selected: SelectedProductOption[]): string {
  return selected.map((item) => `${item.groupName}: ${item.choiceLabel}`).join(' · ')
}

export function unitPriceWithOptions(
  basePriceCents: number,
  selected: SelectedProductOption[],
): number {
  return Math.max(0, basePriceCents + optionsPriceDeltaCents(selected))
}

/** Validate required groups are selected; returns error message or null. */
export function validateSelectedOptions(
  groups: ProductOptionGroup[],
  selectedByGroupId: Record<string, string>,
): string | null {
  for (const group of groups) {
    const choiceId = selectedByGroupId[group.id]
    if (!choiceId) {
      if (group.required) return `Choose ${group.name}`
      continue
    }
    if (!group.choices.some((choice) => choice.id === choiceId)) {
      return `Invalid choice for ${group.name}`
    }
  }
  return null
}

export function productHasConfigurableOptions(
  product: { optionsMode?: ProductOptionsMode; optionGroups?: ProductOptionGroup[]; productTypeId?: string },
  productType: { optionGroups?: ProductOptionGroup[] } | null | undefined,
): boolean {
  return resolveProductOptionGroups(product, productType).length > 0
}

export function buildSelectedOptions(
  groups: ProductOptionGroup[],
  selectedByGroupId: Record<string, string>,
): SelectedProductOption[] {
  const selected: SelectedProductOption[] = []

  for (const group of groups) {
    const choiceId = selectedByGroupId[group.id]
    if (!choiceId) continue
    const choice = group.choices.find((item) => item.id === choiceId)
    if (!choice) continue
    selected.push({
      groupId: group.id,
      groupName: group.name,
      choiceId: choice.id,
      choiceLabel: choice.label,
      priceDeltaCents: choice.priceDeltaCents || 0,
      ...(choice.imageUrl ? { imageUrl: choice.imageUrl } : {}),
    })
  }

  return selected
}
