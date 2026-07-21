const { PACKAGE_DIMS } = require('./packaging')

const DEFAULT_LETTER_SETTINGS = {
  letterFlatFeeCents: 150,
  letterMaxItems: 10,
}

function isLetterEligible(product, productTypes) {
  const productType = product?.productTypeId
    ? productTypes.find((type) => type.id === product.productTypeId)
    : null

  if (productType) {
    if (productType.shipsAsLetter === true) return true
    if (productType.shipsAsLetter === false) return false
    // Back-compat: preferred shipping type "letter"
    if (productType.shippingTypeId === 'letter') return true
  }

  return product?.shipClass === 'letter'
}

function decidePackaging(lines, productTypes = [], letterMaxItems = 10) {
  const safeLines = Array.isArray(lines) ? lines.filter((line) => line && line.quantity > 0) : []

  if (safeLines.length === 0) {
    return {
      packageType: 'bubble_mailer',
      postageMode: 'label',
      reason: 'No items — default to bubble mailer.',
      dims: PACKAGE_DIMS.bubble_mailer,
      weightOz: 1,
      shipClasses: [],
    }
  }

  let totalQty = 0
  let allLetter = true
  const shipClasses = new Set()

  for (const line of safeLines) {
    const qty = Math.max(1, Math.round(Number(line.quantity) || 1))
    totalQty += qty
    const letter = isLetterEligible(line.product || {}, productTypes)
    shipClasses.add(letter ? 'letter' : 'soft_pack')
    if (!letter) allLetter = false
  }

  const maxItems = letterMaxItems > 0 ? letterMaxItems : 10

  if (allLetter && totalQty <= maxItems) {
    return {
      packageType: 'envelope',
      postageMode: 'stamp',
      reason: `${totalQty} letter item${totalQty === 1 ? '' : 's'} (max ${maxItems}) — flat letter rate.`,
      dims: PACKAGE_DIMS.envelope,
      weightOz: 1,
      shipClasses: [...shipClasses],
    }
  }

  return {
    packageType: 'bubble_mailer',
    postageMode: 'label',
    reason: allLetter
      ? `More than ${maxItems} letter items — upgrade to bubble mailer (live Shippo rates).`
      : 'Order includes non-letter items — bubble mailer (live Shippo rates).',
    dims: PACKAGE_DIMS.bubble_mailer,
    weightOz: Math.max(1, totalQty * 0.15),
    shipClasses: [...shipClasses],
  }
}

function quoteShipping({
  lines,
  productTypes = [],
  letterSettings = DEFAULT_LETTER_SETTINGS,
}) {
  const settings = {
    letterFlatFeeCents:
      typeof letterSettings?.letterFlatFeeCents === 'number'
        ? Math.max(0, Math.round(letterSettings.letterFlatFeeCents))
        : DEFAULT_LETTER_SETTINGS.letterFlatFeeCents,
    letterMaxItems:
      typeof letterSettings?.letterMaxItems === 'number' && letterSettings.letterMaxItems > 0
        ? Math.round(letterSettings.letterMaxItems)
        : DEFAULT_LETTER_SETTINGS.letterMaxItems,
  }

  const packaging = decidePackaging(lines, productTypes, settings.letterMaxItems)

  if (packaging.packageType === 'envelope' && packaging.postageMode === 'stamp') {
    return {
      amountCents: settings.letterFlatFeeCents,
      displayName: 'Untracked letter',
      free: settings.letterFlatFeeCents <= 0,
      packaging,
      shippingTypeId: 'letter',
      overweightOz: 0,
      overweightCents: 0,
      reason: packaging.reason,
    }
  }

  return {
    amountCents: 0,
    displayName: 'Bubble mailer',
    free: false,
    packaging,
    shippingTypeId: null,
    overweightOz: 0,
    overweightCents: 0,
    reason: packaging.reason,
  }
}

function parseProductType(id, data = {}) {
  if (typeof data.name !== 'string' || !data.name.trim()) return null

  const shippingTypeId = typeof data.shippingTypeId === 'string' ? data.shippingTypeId : ''
  const shipsAsLetter =
    data.shipsAsLetter === true ||
    (data.shipsAsLetter !== false && shippingTypeId === 'letter')

  return {
    id,
    name: data.name.trim(),
    description: typeof data.description === 'string' ? data.description : '',
    defaultPriceCents: Math.max(0, Math.round(Number(data.defaultPriceCents) || 0)),
    shippingTypeId,
    shipsAsLetter,
    maxLetterQty: Math.max(0, Math.round(Number(data.maxLetterQty) || 0)),
    sortOrder: typeof data.sortOrder === 'number' ? data.sortOrder : 0,
    active: data.active !== false,
  }
}

function parseShippingType(id, data = {}) {
  if (typeof data.name !== 'string' || !data.name.trim()) return null

  const packageType =
    data.packageType === 'envelope' || data.packageType === 'bubble_mailer' || data.packageType === 'box'
      ? data.packageType
      : 'bubble_mailer'
  const postageMode = data.postageMode === 'stamp' ? 'stamp' : 'label'
  const shipClass =
    data.shipClass === 'letter' || data.shipClass === 'soft_pack' || data.shipClass === 'parcel'
      ? data.shipClass
      : packageType === 'envelope'
        ? 'letter'
        : packageType === 'box'
          ? 'parcel'
          : 'soft_pack'

  return {
    id,
    name: data.name.trim(),
    packageType,
    postageMode,
    shipClass,
    baseRateCents: Math.max(0, Math.round(Number(data.baseRateCents) || 0)),
    freeAboveSubtotalCents:
      typeof data.freeAboveSubtotalCents === 'number' && data.freeAboveSubtotalCents > 0
        ? Math.round(data.freeAboveSubtotalCents)
        : null,
    includedWeightOz: Math.max(0, Number(data.includedWeightOz) || 0),
    overweightCentsPerOz: Math.max(0, Math.round(Number(data.overweightCentsPerOz) || 0)),
    maxWeightOz: Math.max(0, Number(data.maxWeightOz) || 0),
    maxThicknessIn: Math.max(0, Number(data.maxThicknessIn) || 0),
    maxItems: Math.max(0, Math.round(Number(data.maxItems) || 0)),
    sortOrder: typeof data.sortOrder === 'number' ? data.sortOrder : 0,
    active: data.active !== false,
  }
}

module.exports = {
  DEFAULT_LETTER_SETTINGS,
  decidePackaging,
  quoteShipping,
  isLetterEligible,
  parseProductType,
  parseShippingType,
}
