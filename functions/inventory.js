const { getFirestore, FieldValue } = require('firebase-admin/firestore')

function getDb() {
  return getFirestore()
}

function tracksStock(product) {
  return product?.trackStock === true
}

function stockOnHand(product) {
  if (!tracksStock(product)) return null
  const qty = Math.floor(Number(product?.stockQuantity) || 0)
  return Math.max(0, qty)
}

/**
 * Aggregate requested quantities by product id (options variants share one pool).
 * @param {Array<{ productId?: string, quantity?: number }>} lines
 * @returns {Map<string, number>}
 */
function aggregateQuantityByProductId(lines) {
  const totals = new Map()
  for (const line of lines) {
    const productId = String(line?.productId || '').trim()
    if (!productId) continue
    const qty = Math.max(0, Math.round(Number(line?.quantity) || 0))
    if (qty < 1) continue
    totals.set(productId, (totals.get(productId) || 0) + qty)
  }
  return totals
}

/**
 * Soft stock check before creating a Stripe Checkout session.
 * @param {Map<string, object>} productsById
 * @param {Map<string, number>} requestedByProductId
 * @returns {{ ok: true } | { ok: false, error: string }}
 */
function validateStockAvailability(productsById, requestedByProductId) {
  for (const [productId, requested] of requestedByProductId.entries()) {
    const product = productsById.get(productId)
    if (!product) {
      return { ok: false, error: 'One or more products are no longer available.' }
    }

    if (product.isDeleted === true || product.active === false) {
      const name = typeof product.name === 'string' ? product.name : 'This item'
      return { ok: false, error: `${name} is no longer available.` }
    }

    const available = stockOnHand(product)
    if (available === null) continue

    if (requested > available) {
      const name = typeof product.name === 'string' ? product.name : 'This item'
      if (available <= 0) {
        return { ok: false, error: `${name} is sold out.` }
      }
      return {
        ok: false,
        error: `Only ${available} left of ${name}. Reduce quantity and try again.`,
      }
    }
  }

  return { ok: true }
}

/**
 * Deduct inventory after a paid checkout. Idempotent via orders.stockDeducted.
 * Oversells clamp to zero (rare race between session create and payment).
 */
async function deductStockForCheckoutSession(stripe, session) {
  if (session.payment_status !== 'paid') {
    return { deducted: false, reason: 'not_paid' }
  }

  const orderRef = getDb().collection('orders').doc(session.id)
  const existing = await orderRef.get()
  if (existing.exists && existing.data().stockDeducted === true) {
    return { deducted: false, reason: 'already_deducted' }
  }

  let qtyByProductId = new Map()

  if (existing.exists && Array.isArray(existing.data().items)) {
    qtyByProductId = aggregateQuantityByProductId(existing.data().items)
  }

  if (qtyByProductId.size === 0) {
    const expanded = await stripe.checkout.sessions.retrieve(session.id, {
      expand: ['line_items.data.price.product'],
    })
    const lines = []
    for (const item of expanded.line_items?.data ?? []) {
      const price = typeof item.price === 'object' ? item.price : null
      const stripeProduct = price && typeof price.product === 'object' ? price.product : null
      const meta = stripeProduct?.metadata || {}
      let productId = typeof meta.productId === 'string' ? meta.productId.trim() : ''
      const catalogPriceId =
        typeof meta.stripePriceId === 'string' ? meta.stripePriceId : price?.id || ''

      if (!productId && catalogPriceId) {
        const snapshot = await getDb()
          .collection('products')
          .where('stripePriceId', '==', catalogPriceId)
          .limit(1)
          .get()
        if (!snapshot.empty) productId = snapshot.docs[0].id
      }

      lines.push({
        productId,
        quantity: item.quantity || 1,
      })
    }
    qtyByProductId = aggregateQuantityByProductId(lines)
  }

  if (qtyByProductId.size === 0) {
    await orderRef.set({ stockDeducted: true, stockDeductedAt: FieldValue.serverTimestamp() }, { merge: true })
    return { deducted: false, reason: 'no_product_ids' }
  }

  const adjustments = []

  await getDb().runTransaction(async (tx) => {
    const orderSnap = await tx.get(orderRef)
    if (orderSnap.exists && orderSnap.data().stockDeducted === true) return

    const productRefs = [...qtyByProductId.keys()].map((id) => getDb().collection('products').doc(id))
    const productSnaps = await Promise.all(productRefs.map((ref) => tx.get(ref)))

    for (let i = 0; i < productRefs.length; i += 1) {
      const productSnap = productSnaps[i]
      if (!productSnap.exists) continue

      const product = productSnap.data()
      if (!tracksStock(product)) continue

      const requested = qtyByProductId.get(productSnap.id) || 0
      if (requested < 1) continue

      const current = stockOnHand(product) ?? 0
      const next = Math.max(0, current - requested)
      adjustments.push({
        productId: productSnap.id,
        name: product.name || productSnap.id,
        from: current,
        to: next,
        requested,
      })

      tx.set(
        productRefs[i],
        {
          stockQuantity: next,
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true },
      )
    }

    tx.set(
      orderRef,
      {
        stockDeducted: true,
        stockDeductedAt: FieldValue.serverTimestamp(),
        stockAdjustments: adjustments,
      },
      { merge: true },
    )
  })

  return { deducted: true, adjustments }
}

module.exports = {
  aggregateQuantityByProductId,
  validateStockAvailability,
  deductStockForCheckoutSession,
  tracksStock,
  stockOnHand,
}
