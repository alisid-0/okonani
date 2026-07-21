const { getFirestore, FieldValue } = require('firebase-admin/firestore')
const { normalizeShipClass } = require('./packaging')
const { quoteShipping, parseShippingType, parseProductType } = require('./shippingQuote')
const { letterSettingsFromCatalog } = require('./checkoutShipping')

function getDb() {
  return getFirestore()
}

function mapStripeAddress(details) {
  if (!details) return null

  const address = details.address || {}
  const line1 = String(address.line1 || '').trim()
  if (!line1) return null

  return {
    name: String(details.name || '').trim(),
    phone: String(details.phone || '').trim(),
    line1,
    line2: String(address.line2 || '').trim(),
    city: String(address.city || '').trim(),
    state: String(address.state || '').trim(),
    postalCode: String(address.postal_code || address.postalCode || '').trim(),
    country: String(address.country || '').trim(),
  }
}

/**
 * Embedded Checkout + server_only shipping writes address to collected_information.shipping_details.
 * Hosted Checkout historically used shipping_details.
 */
function resolveShippingAddress(...sources) {
  for (const source of sources) {
    if (!source || typeof source !== 'object') continue
    const mapped =
      mapStripeAddress(source.collected_information?.shipping_details) ||
      mapStripeAddress(source.shipping_details) ||
      mapStripeAddress(source)
    if (mapped?.line1) return mapped
  }
  return null
}

async function loadProductsByStripePriceIds(priceIds) {
  const unique = [...new Set(priceIds.filter(Boolean))]
  const byPriceId = new Map()

  await Promise.all(
    unique.map(async (priceId) => {
      const snapshot = await getDb()
        .collection('products')
        .where('stripePriceId', '==', priceId)
        .limit(1)
        .get()

      if (!snapshot.empty) {
        byPriceId.set(priceId, { id: snapshot.docs[0].id, ...snapshot.docs[0].data() })
      }
    }),
  )

  return byPriceId
}

async function loadProductsByIds(productIds) {
  const unique = [...new Set(productIds.filter(Boolean))]
  const byId = new Map()

  await Promise.all(
    unique.map(async (productId) => {
      const snap = await getDb().collection('products').doc(productId).get()
      if (snap.exists) {
        byId.set(productId, { id: snap.id, ...snap.data() })
      }
    }),
  )

  return byId
}

async function loadShippingCatalog() {
  const [shippingSnap, productTypeSnap] = await Promise.all([
    getDb().collection('shippingTypes').get(),
    getDb().collection('productTypes').get(),
  ])

  const shippingTypes = shippingSnap.docs
    .map((docSnap) => parseShippingType(docSnap.id, docSnap.data()))
    .filter(Boolean)

  const productTypes = productTypeSnap.docs
    .map((docSnap) => parseProductType(docSnap.id, docSnap.data()))
    .filter(Boolean)

  return { shippingTypes, productTypes }
}

async function persistCheckoutOrder(stripe, session) {
  if (session.payment_status !== 'paid') {
    return { saved: false, reason: 'not_paid' }
  }

  const orderRef = getDb().collection('orders').doc(session.id)
  const existing = await orderRef.get()

  if (existing.exists && existing.data().fulfillmentStatus && existing.data().items?.length) {
    return { saved: true, reason: 'already_persisted', orderId: session.id, isNew: false }
  }

  const expanded = await stripe.checkout.sessions.retrieve(session.id, {
    expand: ['line_items.data.price.product', 'shipping_cost.shipping_rate'],
  })

  const lineItems = expanded.line_items?.data ?? []
  const priceIds = lineItems
    .map((item) => {
      const price = typeof item.price === 'object' ? item.price : null
      const stripeProduct = price && typeof price.product === 'object' ? price.product : null
      const metaPriceId = stripeProduct?.metadata?.stripePriceId
      return metaPriceId || (price?.id ? price.id : null)
    })
    .filter(Boolean)

  const productIds = lineItems
    .map((item) => {
      const price = typeof item.price === 'object' ? item.price : null
      const stripeProduct = price && typeof price.product === 'object' ? price.product : null
      return typeof stripeProduct?.metadata?.productId === 'string'
        ? stripeProduct.metadata.productId
        : null
    })
    .filter(Boolean)

  const [productsByPrice, productsById, catalog] = await Promise.all([
    loadProductsByStripePriceIds(priceIds),
    loadProductsByIds(productIds),
    loadShippingCatalog(),
  ])

  const items = lineItems.map((item) => {
    const price = typeof item.price === 'object' ? item.price : null
    const priceId = price?.id || ''
    const stripeProduct = price && typeof price.product === 'object' ? price.product : null
    const meta = stripeProduct?.metadata || {}
    const catalogPriceId = typeof meta.stripePriceId === 'string' ? meta.stripePriceId : priceId
    const productFromPrice = productsByPrice.get(catalogPriceId) || productsByPrice.get(priceId)
    const productFromMeta =
      typeof meta.productId === 'string' && meta.productId
        ? productsById.get(meta.productId)
        : null
    const product = productFromMeta || productFromPrice
    const quantity = item.quantity || 1

    let selectedOptions = []
    if (typeof meta.selectedOptions === 'string' && meta.selectedOptions) {
      try {
        const parsed = JSON.parse(meta.selectedOptions)
        if (Array.isArray(parsed)) selectedOptions = parsed
      } catch {
        selectedOptions = []
      }
    }

    return {
      productId: product?.id || meta.productId || null,
      name: item.description || product?.name || 'Item',
      quantity,
      unitAmountCents:
        typeof price?.unit_amount === 'number' ? price.unit_amount : product?.priceInCents || 0,
      amountCents: typeof item.amount_total === 'number' ? item.amount_total : 0,
      stripePriceId: catalogPriceId || priceId || null,
      selectedOptions,
      productTypeId: typeof product?.productTypeId === 'string' ? product.productTypeId : '',
      shipClass: normalizeShipClass(product?.shipClass),
      weightOz: typeof product?.weightOz === 'number' ? product.weightOz : null,
      thicknessIn: typeof product?.thicknessIn === 'number' ? product.thicknessIn : null,
      maxLetterQty: typeof product?.maxLetterQty === 'number' ? product.maxLetterQty : null,
    }
  })

  const quote = quoteShipping({
    lines: items.map((item) => ({
      quantity: item.quantity,
      product: {
        name: item.name,
        productTypeId: item.productTypeId,
        shipClass: item.shipClass,
        weightOz: item.weightOz ?? undefined,
        thicknessIn: item.thicknessIn ?? undefined,
        maxLetterQty: item.maxLetterQty ?? undefined,
      },
    })),
    productTypes: catalog.productTypes,
    letterSettings: letterSettingsFromCatalog(catalog.shippingTypes),
  })

  const packaging = quote.packaging
  const shippingRate = expanded.shipping_cost?.shipping_rate
  const shippingRateName =
    shippingRate && typeof shippingRate === 'object' && shippingRate.display_name
      ? shippingRate.display_name
      : typeof session.metadata?.shippingRateName === 'string'
        ? session.metadata.shippingRateName
        : ''

  const rateNameLower = shippingRateName.toLowerCase()
  const fromRateName =
    rateNameLower.includes('letter') ? 'envelope'
    : rateNameLower.includes('bubble') || rateNameLower.includes('mailer') ? 'bubble_mailer'
    : null

  const metadataPackageType = session.metadata?.packageType
  const resolvedPackageType =
    fromRateName ||
    (metadataPackageType === 'envelope' || metadataPackageType === 'bubble_mailer'
      ? metadataPackageType
      : packaging.packageType)

  const shipping = resolveShippingAddress(expanded, session)

  const shippingCostCents =
    typeof expanded.shipping_cost?.amount_total === 'number'
      ? expanded.shipping_cost.amount_total
      : typeof session.shipping_cost?.amount_total === 'number'
        ? session.shipping_cost.amount_total
        : 0

  const displayShippingName =
    shippingRateName ||
    (shippingCostCents === 0 ? 'Free shipping' : quote.displayName || 'Shipping')

  let packagingSuggestion = packaging
  let postageMode = packaging.postageMode

  if (resolvedPackageType === 'bubble_mailer') {
    postageMode = 'label'
    packagingSuggestion = {
      ...packaging,
      packageType: 'bubble_mailer',
      postageMode: 'label',
      reason: 'Customer selected Bubble mailer at checkout (live Shippo rate).',
    }
  } else if (resolvedPackageType === 'envelope') {
    postageMode = 'stamp'
    packagingSuggestion = {
      ...packaging,
      packageType: 'envelope',
      postageMode: 'stamp',
      reason: 'Customer selected Untracked letter at checkout.',
    }
  }

  const customerName =
    shipping?.name ||
    session.customer_details?.name ||
    expanded.customer_details?.name ||
    ''

  const payload = {
    stripeSessionId: session.id,
    userId: session.metadata?.firebaseUid || null,
    email: session.customer_details?.email || session.customer_email || null,
    customerName,
    phone: session.customer_details?.phone || shipping?.phone || null,
    paymentStatus: session.payment_status,
    amountTotal: session.amount_total ?? 0,
    currency: session.currency || 'usd',
    items,
    shippingAddress: shipping,
    shippingAmountCents: shippingCostCents,
    shippingRateName: displayShippingName,
    shippingQuote: {
      amountCents: shippingCostCents || quote.amountCents,
      displayName: displayShippingName,
      shippingTypeId: quote.shippingTypeId,
      overweightOz: quote.overweightOz,
      overweightCents: quote.overweightCents,
      reason: quote.reason,
    },
    fulfillmentStatus: existing.exists ? existing.data().fulfillmentStatus || 'unfulfilled' : 'unfulfilled',
    packagingSuggestion,
    packageType: existing.exists
      ? existing.data().packageType || resolvedPackageType
      : resolvedPackageType,
    postageMode: existing.exists ? existing.data().postageMode || postageMode : postageMode,
    updatedAt: FieldValue.serverTimestamp(),
  }

  if (!existing.exists) {
    payload.createdAt = FieldValue.serverTimestamp()
  }

  await orderRef.set(payload, { merge: true })

  return {
    saved: true,
    orderId: session.id,
    packaging,
    isNew: !existing.exists,
    order: {
      id: session.id,
      email: payload.email,
      customerName: payload.customerName,
      phone: payload.phone,
      amountTotal: payload.amountTotal,
      currency: payload.currency,
      paymentStatus: payload.paymentStatus,
      items: payload.items,
      shippingAddress: payload.shippingAddress,
      shippingAmountCents: payload.shippingAmountCents,
      shippingRateName: payload.shippingRateName,
      packageType: payload.packageType,
      postageMode: payload.postageMode,
    },
  }
}

module.exports = {
  persistCheckoutOrder,
  mapStripeAddress,
  resolveShippingAddress,
  loadProductsByStripePriceIds,
  loadProductsByIds,
  loadShippingCatalog,
}
