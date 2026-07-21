/**
 * Packaging rules for physical okonani orders.
 * letter → envelope + stamp; soft_pack → bubble mailer + label; parcel → box + label.
 */

const LETTER_MAX_WEIGHT_OZ = 3
const LETTER_MAX_THICKNESS_IN = 0.25

const PACKAGE_DIMS = {
  envelope: { lengthIn: 9.5, widthIn: 6, heightIn: 0.25 },
  bubble_mailer: { lengthIn: 8, widthIn: 6, heightIn: 2 },
  box: { lengthIn: 8, widthIn: 6, heightIn: 4 },
}

const DEFAULT_PROFILES = {
  letter: { weightOz: 0.1, thicknessIn: 0.02, maxLetterQty: 10 },
  soft_pack: { weightOz: 1, thicknessIn: 0.5, maxLetterQty: 0 },
  parcel: { weightOz: 4, thicknessIn: 2, maxLetterQty: 0 },
}

function normalizeShipClass(value) {
  if (value === 'letter' || value === 'soft_pack' || value === 'parcel') return value
  return 'soft_pack'
}

function resolveProfile(product) {
  const shipClass = normalizeShipClass(product?.shipClass)
  const defaults = DEFAULT_PROFILES[shipClass]
  const rawWeight = Number(product?.weightOz)
  const weightOz =
    Number.isFinite(rawWeight) && rawWeight > 0 ? rawWeight : defaults.weightOz
  const rawThickness = Number(product?.thicknessIn)
  const thicknessIn =
    Number.isFinite(rawThickness) && rawThickness >= 0 ? rawThickness : defaults.thicknessIn
  const rawMaxLetter = Number(product?.maxLetterQty)
  const maxLetterQty =
    Number.isFinite(rawMaxLetter) && rawMaxLetter >= 0
      ? Math.round(rawMaxLetter)
      : defaults.maxLetterQty

  return { shipClass, weightOz, thicknessIn, maxLetterQty }
}

/**
 * @param {Array<{ quantity: number, product: { shipClass?: string, weightOz?: number, thicknessIn?: number, maxLetterQty?: number, name?: string } }>} lines
 * @param {{ letterMaxWeightOz?: number, letterMaxThicknessIn?: number, letterMaxItems?: number }} [options]
 */
function suggestPackaging(lines, options = {}) {
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

  const safeLines = Array.isArray(lines) ? lines.filter((line) => line && line.quantity > 0) : []

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
    name: line.product?.name || 'item',
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

function packagingOverride(packageType) {
  if (packageType === 'envelope') {
    return {
      packageType: 'envelope',
      postageMode: 'stamp',
      dims: PACKAGE_DIMS.envelope,
    }
  }

  if (packageType === 'box') {
    return {
      packageType: 'box',
      postageMode: 'label',
      dims: PACKAGE_DIMS.box,
    }
  }

  return {
    packageType: 'bubble_mailer',
    postageMode: 'label',
    dims: PACKAGE_DIMS.bubble_mailer,
  }
}

module.exports = {
  LETTER_MAX_WEIGHT_OZ,
  LETTER_MAX_THICKNESS_IN,
  PACKAGE_DIMS,
  DEFAULT_PROFILES,
  normalizeShipClass,
  resolveProfile,
  suggestPackaging,
  packagingOverride,
}
