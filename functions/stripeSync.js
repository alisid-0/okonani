async function syncProductToStripe(stripe, productId, data, existing) {
  const name = String(data.name).trim()
  const description = typeof data.description === 'string' ? data.description.trim() : ''
  const priceInCents = Number(data.priceInCents)

  if (!name) {
    throw new Error('Product name is required')
  }

  if (!Number.isInteger(priceInCents) || priceInCents < 50) {
    throw new Error('Price must be at least $0.50')
  }

  if (!existing?.stripeProductId) {
    const stripeProduct = await stripe.products.create({
      name,
      description: description || undefined,
      metadata: { firestoreId: productId },
    })

    const stripePrice = await stripe.prices.create({
      product: stripeProduct.id,
      unit_amount: priceInCents,
      currency: 'usd',
    })

    return {
      stripeProductId: stripeProduct.id,
      stripePriceId: stripePrice.id,
      stripeSyncedAt: new Date().toISOString(),
    }
  }

  await stripe.products.update(existing.stripeProductId, {
    name,
    description: description || undefined,
  })

  const updates = {
    stripeSyncedAt: new Date().toISOString(),
  }

  if (existing.priceInCents !== priceInCents) {
    const stripePrice = await stripe.prices.create({
      product: existing.stripeProductId,
      unit_amount: priceInCents,
      currency: 'usd',
    })

    if (existing.stripePriceId) {
      await stripe.prices.update(existing.stripePriceId, { active: false })
    }

    updates.stripePriceId = stripePrice.id
  }

  return updates
}

module.exports = { syncProductToStripe }
