export type ShipClass = 'letter' | 'soft_pack' | 'parcel'
export type PackageType = 'envelope' | 'bubble_mailer' | 'box'
export type PostageMode = 'stamp' | 'label'

export type ShippingProfile = {
  shipClass: ShipClass
  weightOz: number
  thicknessIn: number
  maxLetterQty: number
}

export type PackagingSuggestion = {
  packageType: PackageType
  postageMode: PostageMode
  reason: string
  dims: { lengthIn: number; widthIn: number; heightIn: number }
  weightOz: number
  shipClasses: ShipClass[]
}

export const LETTER_MAX_WEIGHT_OZ = 3
export const LETTER_MAX_THICKNESS_IN = 0.25

export const PACKAGE_DIMS: Record<PackageType, { lengthIn: number; widthIn: number; heightIn: number }> = {
  envelope: { lengthIn: 9.5, widthIn: 6, heightIn: 0.25 },
  bubble_mailer: { lengthIn: 8, widthIn: 6, heightIn: 2 },
  box: { lengthIn: 8, widthIn: 6, heightIn: 4 },
}

const DEFAULT_PROFILES: Record<ShipClass, Omit<ShippingProfile, 'shipClass'>> = {
  letter: { weightOz: 0.1, thicknessIn: 0.02, maxLetterQty: 10 },
  soft_pack: { weightOz: 1, thicknessIn: 0.5, maxLetterQty: 0 },
  parcel: { weightOz: 4, thicknessIn: 2, maxLetterQty: 0 },
}

export function normalizeShipClass(value: unknown): ShipClass {
  if (value === 'letter' || value === 'soft_pack' || value === 'parcel') return value
  return 'soft_pack'
}

export function resolveProfile(product: {
  shipClass?: string
  weightOz?: number | null
  thicknessIn?: number | null
  maxLetterQty?: number | null
}): ShippingProfile {
  const shipClass = normalizeShipClass(product.shipClass)
  const defaults = DEFAULT_PROFILES[shipClass]

  return {
    shipClass,
    weightOz:
      typeof product.weightOz === 'number' && product.weightOz > 0 ? product.weightOz : defaults.weightOz,
    thicknessIn:
      typeof product.thicknessIn === 'number' && product.thicknessIn >= 0
        ? product.thicknessIn
        : defaults.thicknessIn,
    maxLetterQty:
      typeof product.maxLetterQty === 'number' && product.maxLetterQty >= 0
        ? Math.round(product.maxLetterQty)
        : defaults.maxLetterQty,
  }
}

export type SuggestPackagingOptions = {
  letterMaxWeightOz?: number
  letterMaxThicknessIn?: number
  letterMaxItems?: number
}

export function suggestPackaging(
  lines: Array<{
    quantity: number
    product: {
      name?: string
      shipClass?: string
      weightOz?: number | null
      thicknessIn?: number | null
      maxLetterQty?: number | null
    }
  }>,
  options: SuggestPackagingOptions = {},
): PackagingSuggestion {
  const letterMaxWeightOz =
    typeof options.letterMaxWeightOz === 'number' && options.letterMaxWeightOz > 0
      ? options.letterMaxWeightOz
      : LETTER_MAX_WEIGHT_OZ
  const letterMaxThicknessIn =
    typeof options.letterMaxThicknessIn === 'number' && options.letterMaxThicknessIn > 0
      ? options.letterMaxThicknessIn
      : LETTER_MAX_THICKNESS_IN
  const letterMaxItems =
    typeof options.letterMaxItems === 'number' && options.letterMaxItems > 0
      ? options.letterMaxItems
      : 0

  const safeLines = lines.filter((line) => line && line.quantity > 0)

  if (safeLines.length === 0) {
    return {
      packageType: 'bubble_mailer',
      postageMode: 'label',
      reason: 'No line items — default to bubble mailer with a shipping label.',
      dims: PACKAGE_DIMS.bubble_mailer,
      weightOz: 1,
      shipClasses: [],
    }
  }

  const resolved = safeLines.map((line) => ({
    quantity: Math.max(1, Math.round(Number(line.quantity) || 1)),
    profile: resolveProfile(line.product),
  }))

  const shipClasses = [...new Set(resolved.map((line) => line.profile.shipClass))]
  let totalWeightOz = 0
  let totalThicknessIn = 0
  let totalQty = 0

  for (const line of resolved) {
    totalWeightOz += line.profile.weightOz * line.quantity
    totalThicknessIn += line.profile.thicknessIn * line.quantity
    totalQty += line.quantity
  }

  totalWeightOz = Math.round(totalWeightOz * 100) / 100
  totalThicknessIn = Math.round(totalThicknessIn * 1000) / 1000

  if (shipClasses.includes('parcel')) {
    return {
      packageType: 'box',
      postageMode: 'label',
      reason: 'Order includes a parcel-class item — use a small box and print a shipping label.',
      dims: PACKAGE_DIMS.box,
      weightOz: Math.max(totalWeightOz, 4),
      shipClasses,
    }
  }

  if (shipClasses.includes('soft_pack')) {
    return {
      packageType: 'bubble_mailer',
      postageMode: 'label',
      reason: 'Order includes soft-pack items (e.g. charms) — use a bubble mailer and print a shipping label.',
      dims: PACKAGE_DIMS.bubble_mailer,
      weightOz: Math.max(totalWeightOz, 1),
      shipClasses,
    }
  }

  const allLetter = shipClasses.length === 1 && shipClasses[0] === 'letter'
  const withinLetterQty = resolved.every(
    (line) => line.profile.maxLetterQty <= 0 || line.quantity <= line.profile.maxLetterQty,
  )
  const withinTotalItems = letterMaxItems <= 0 || totalQty <= letterMaxItems
  const letterEligible =
    allLetter &&
    withinLetterQty &&
    withinTotalItems &&
    totalWeightOz <= letterMaxWeightOz &&
    totalThicknessIn <= letterMaxThicknessIn

  if (letterEligible) {
    return {
      packageType: 'envelope',
      postageMode: 'stamp',
      reason:
        'All items are letter-class and under weight/thickness limits — use an envelope and a stamp (no carrier label).',
      dims: PACKAGE_DIMS.envelope,
      weightOz: Math.max(totalWeightOz, 0.1),
      shipClasses,
    }
  }

  return {
    packageType: 'bubble_mailer',
    postageMode: 'label',
    reason: allLetter
      ? 'Letter-class items exceed letter limits (weight, thickness, or quantity) — upgrade to bubble mailer + label.'
      : 'Mixed or unknown items — use a bubble mailer and print a shipping label.',
    dims: PACKAGE_DIMS.bubble_mailer,
    weightOz: Math.max(totalWeightOz, 1),
    shipClasses,
  }
}

export function packageTypeLabel(type: PackageType): string {
  if (type === 'envelope') return 'Envelope (letter)'
  if (type === 'box') return 'Small box'
  return 'Bubble mailer'
}

export function shipClassLabel(shipClass: ShipClass): string {
  if (shipClass === 'letter') return 'Letter (flat / stampable)'
  if (shipClass === 'parcel') return 'Parcel (box)'
  return 'Soft pack (bubble mailer)'
}
