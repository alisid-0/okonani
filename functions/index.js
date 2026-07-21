const crypto = require('node:crypto')
const { initializeApp, getApps } = require('firebase-admin/app')
const { getAuth } = require('firebase-admin/auth')
const { getStorage } = require('firebase-admin/storage')
const { defineSecret } = require('firebase-functions/params')
const { onRequest } = require('firebase-functions/v2/https')
const Stripe = require('stripe')
const {
  adminEmailsSecret,
  getAdminEmails,
  getClientUrl,
  getProjectId,
  getStorageBucketName,
  getStripeSecretKey,
  getStripeWebhookSecret,
  shippoApiTokenSecret,
  shipFromJsonSecret,
  resendApiKeySecret,
  mailFromSecret,
  orderNotifyEmailSecret,
  clientUrlSecret,
} = require('./env')
const { syncProductToStripe } = require('./stripeSync')
const {
  POINTS_PER_DOLLAR,
  REDEEM_POINTS_COST,
  REDEEM_DISCOUNT_CENTS,
  getUserPoints,
  getActiveReward,
  listActiveRewards,
  awardPointsForCheckoutSession,
  redeemPointsForCoupon,
  pointsForAmountCents,
} = require('./points')
const { persistCheckoutOrder, loadProductsByStripePriceIds, loadProductsByIds, loadShippingCatalog, resolveShippingAddress } = require('./orders')
const {
  aggregateQuantityByProductId,
  validateStockAvailability,
  deductStockForCheckoutSession,
} = require('./inventory')
const { suggestPackaging, packagingOverride, PACKAGE_DIMS } = require('./packaging')
const {
  buildCheckoutShippingQuote,
  dummyStripeShippingOption,
  letterSettingsFromCatalog,
  parseDestinationAddress,
  ratesToStripeShippingOptions,
  toStripeCollectedShippingDetails,
} = require('./checkoutShipping')
const { decidePackaging } = require('./shippingQuote')
const { createShipmentRates, purchaseLabel, registerTracking, normalizeTrackingStatus } = require('./shippo')
const { sendShippingConfirmationEmail, sendDeliveredEmail, sendNewOrderAdminEmail } = require('./mail')
const { getSocialFeeds } = require('./socialFeeds')
const { getFirestore, FieldValue } = require('firebase-admin/firestore')

if (!getApps().length) {
  initializeApp({
    projectId: getProjectId(),
    storageBucket: getStorageBucketName(),
  })
}

const region = 'us-central1'
const stripeSecretKey = defineSecret('STRIPE_SECRET_KEY')
const stripeWebhookSecret = defineSecret('STRIPE_WEBHOOK_SECRET')

function getStripe() {
  const key = getStripeSecretKey() || stripeSecretKey.value()
  if (!key) {
    throw new Error('Missing STRIPE_SECRET_KEY in project root .env')
  }
  return new Stripe(key)
}

function getWebhookSecret() {
  return getStripeWebhookSecret() || stripeWebhookSecret.value()
}

function sendMethodNotAllowed(res, method) {
  res.set('Allow', method).status(405).json({ error: `Use ${method}` })
}

function parseQuantity(value) {
  const quantity = Number(value)
  return Number.isInteger(quantity) && quantity >= 1 && quantity <= 99 ? quantity : null
}

async function resolvePromotionCodeId(stripe, code) {
  const normalized = code.trim()
  if (!normalized) return null

  const promotionCodes = await stripe.promotionCodes.list({
    code: normalized,
    active: true,
    limit: 1,
  })

  const promotionCode = promotionCodes.data[0]
  if (!promotionCode) {
    const error = new Error('Promotion code not found or inactive')
    error.status = 400
    throw error
  }

  return promotionCode.id
}

function isAdminEmail(email) {
  if (!email) return false

  const normalized = email.trim().toLowerCase()
  return getAdminEmails().includes(normalized)
}

async function verifyAuthToken(req) {
  const token = req.get('X-Firebase-Auth')

  if (!token) {
    const error = new Error('Sign in required')
    error.status = 401
    throw error
  }

  return getAuth().verifyIdToken(token)
}

async function verifyOptionalAuthToken(req) {
  const token = req.get('X-Firebase-Auth')
  if (!token) return null

  try {
    return await getAuth().verifyIdToken(token)
  } catch {
    return null
  }
}

async function ensureAdminClaim(decoded) {
  if (!isAdminEmail(decoded.email)) {
    return { allowed: false, claimsUpdated: false }
  }

  if (decoded.admin === true) {
    return { allowed: true, claimsUpdated: false }
  }

  const user = await getAuth().getUser(decoded.uid)
  await getAuth().setCustomUserClaims(decoded.uid, {
    ...(user.customClaims ?? {}),
    admin: true,
  })

  return { allowed: true, claimsUpdated: true }
}

async function requireAdminRequest(req) {
  const decoded = await verifyAuthToken(req)
  const { allowed } = await ensureAdminClaim(decoded)

  if (!allowed) {
    const error = new Error('Admin access required')
    error.status = 403
    throw error
  }

  return decoded
}

function sendHttpError(res, err) {
  console.error(err)
  res.status(err.status || 500).json({ error: err.message || 'Request failed' })
}

const httpOptions = { region, cors: true, invoker: 'public' }

exports.adminCheckAccess = onRequest({ ...httpOptions, secrets: [adminEmailsSecret] }, async (req, res) => {
  if (req.method === 'OPTIONS') {
    res.status(204).send('')
    return
  }

  if (req.method !== 'GET') {
    sendMethodNotAllowed(res, 'GET')
    return
  }

  try {
    const decoded = await verifyAuthToken(req)
    const { allowed, claimsUpdated } = await ensureAdminClaim(decoded)
    res.json({ isAdmin: allowed, claimsUpdated })
  } catch (err) {
    if (err.status === 401) {
      res.json({ isAdmin: false })
      return
    }

    sendHttpError(res, err)
  }
})

exports.adminSaveProduct = onRequest({ ...httpOptions, secrets: [stripeSecretKey, adminEmailsSecret] }, async (req, res) => {
  if (req.method === 'OPTIONS') {
    res.status(204).send('')
    return
  }

  if (req.method !== 'POST') {
    sendMethodNotAllowed(res, 'POST')
    return
  }

  try {
    await requireAdminRequest(req)

    const input = req.body ?? {}
    const productId = String(input.id ?? '').trim()
    const name = String(input.name ?? '').trim()
    const description = String(input.description ?? '').trim()
    const priceInCents = Math.round(Number(input.priceInCents))

    if (!productId) {
      res.status(400).json({ error: 'Product id is required' })
      return
    }

    if (!name) {
      res.status(400).json({ error: 'Product name is required' })
      return
    }

    if (!Number.isInteger(priceInCents) || priceInCents < 50) {
      res.status(400).json({ error: 'Price must be at least $0.50' })
      return
    }

    const existing =
      typeof input.stripeProductId === 'string'
        ? {
            stripeProductId: input.stripeProductId,
            stripePriceId: typeof input.stripePriceId === 'string' ? input.stripePriceId : null,
            priceInCents:
              Number.isInteger(Number(input.previousPriceInCents)) ?
                Number(input.previousPriceInCents)
              : priceInCents,
          }
        : null

    const stripeFields = await syncProductToStripe(
      getStripe(),
      productId,
      { name, description, priceInCents },
      existing,
    )

    res.json(stripeFields)
  } catch (err) {
    console.error('Stripe sync error:', err)
    sendHttpError(res, err instanceof Error ? err : new Error('Could not sync product to Stripe'))
  }
})

exports.adminDeleteProduct = onRequest({ ...httpOptions, secrets: [stripeSecretKey, adminEmailsSecret] }, async (req, res) => {
  if (req.method === 'OPTIONS') {
    res.status(204).send('')
    return
  }

  if (req.method !== 'POST') {
    sendMethodNotAllowed(res, 'POST')
    return
  }

  try {
    await requireAdminRequest(req)

    const stripePriceId = String(req.body?.stripePriceId ?? '').trim()
    const stripeProductId = String(req.body?.stripeProductId ?? '').trim()
    const stripe = getStripe()

    if (stripePriceId.startsWith('price_')) {
      await stripe.prices.update(stripePriceId, { active: false })
    }

    if (stripeProductId.startsWith('prod_')) {
      await stripe.products.update(stripeProductId, { active: false })
    }

    res.json({ ok: true })
  } catch (err) {
    console.error('Product delete error:', err)
    sendHttpError(res, err)
  }
})

function sanitizeUploadFileName(name) {
  return String(name).replace(/[^a-zA-Z0-9._-]/g, '-').slice(0, 80) || 'image'
}

function storageSetupError(err) {
  const message = String(err?.message ?? err ?? '')
  return err?.code === 404 || message.includes('Not Found') || message.includes('does not exist')
}

exports.adminUploadMedia = onRequest(
  { ...httpOptions, secrets: [adminEmailsSecret], memory: '512MiB', timeoutSeconds: 120 },
  async (req, res) => {
  if (req.method === 'OPTIONS') {
    res.status(204).send('')
    return
  }

  if (req.method !== 'POST') {
    sendMethodNotAllowed(res, 'POST')
    return
  }

  try {
    await requireAdminRequest(req)

    const productId = String(req.body?.productId ?? '').trim()
    const fileName = sanitizeUploadFileName(req.body?.fileName ?? 'image')
    const contentType = String(req.body?.contentType ?? '')
    const dataBase64 = String(req.body?.dataBase64 ?? '')

    if (!productId) {
      res.status(400).json({ error: 'Product id is required' })
      return
    }

    if (!contentType.startsWith('image/')) {
      res.status(400).json({ error: 'Only image uploads are supported' })
      return
    }

    if (!dataBase64) {
      res.status(400).json({ error: 'Missing file data' })
      return
    }

    const buffer = Buffer.from(dataBase64, 'base64')

    if (buffer.length > 10 * 1024 * 1024) {
      res.status(400).json({ error: 'Image must be under 10 MB' })
      return
    }

    const objectPath = `products/${productId}/${Date.now()}-${fileName}`
    const downloadToken = crypto.randomUUID()
    const bucket = getStorage().bucket(getStorageBucketName())
    const file = bucket.file(objectPath)

    await file.save(buffer, {
      metadata: {
        contentType,
        metadata: {
          firebaseStorageDownloadTokens: downloadToken,
        },
      },
    })

    const url = `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(objectPath)}?alt=media&token=${downloadToken}`

    res.json({ url })
  } catch (err) {
    console.error('Media upload error:', err)

    if (storageSetupError(err)) {
      res.status(503).json({
        error:
          'Firebase Storage is not set up yet. In Firebase Console open Storage → Get started, then run: firebase deploy --only storage',
      })
      return
    }

    sendHttpError(res, err)
  }
})

function parseStorageObjectFromUrl(urlString) {
  let parsed

  try {
    parsed = new URL(urlString)
  } catch {
    return null
  }

  if (!parsed.hostname.includes('firebasestorage.googleapis.com')) {
    return null
  }

  const match = parsed.pathname.match(/^\/v0\/b\/([^/]+)\/o\/(.+)$/)
  if (!match) return null

  const bucket = decodeURIComponent(match[1])
  const objectPath = decodeURIComponent(match[2])

  if (bucket !== getStorageBucketName()) return null
  if (!objectPath.startsWith('products/')) return null

  return { bucket, objectPath }
}

exports.adminReadMedia = onRequest(
  { ...httpOptions, secrets: [adminEmailsSecret], memory: '512MiB', timeoutSeconds: 120 },
  async (req, res) => {
    if (req.method === 'OPTIONS') {
      res.status(204).send('')
      return
    }

    if (req.method !== 'POST') {
      sendMethodNotAllowed(res, 'POST')
      return
    }

    try {
      await requireAdminRequest(req)

      const url = String(req.body?.url ?? '').trim()
      const objectRef = parseStorageObjectFromUrl(url)

      if (!objectRef) {
        res.status(400).json({ error: 'Invalid product image URL' })
        return
      }

      const bucket = getStorage().bucket(objectRef.bucket)
      const file = bucket.file(objectRef.objectPath)
      const [exists] = await file.exists()

      if (!exists) {
        res.status(404).json({ error: 'Image not found in storage' })
        return
      }

      const [buffer] = await file.download()
      const [metadata] = await file.getMetadata()
      const contentType =
        typeof metadata.contentType === 'string' && metadata.contentType.startsWith('image/') ?
          metadata.contentType
        : 'image/jpeg'

      if (buffer.length > 10 * 1024 * 1024) {
        res.status(400).json({ error: 'Image must be under 10 MB' })
        return
      }

      res.json({
        contentType,
        dataBase64: buffer.toString('base64'),
      })
    } catch (err) {
      console.error('Media read error:', err)

      if (storageSetupError(err)) {
        res.status(503).json({
          error:
            'Firebase Storage is not set up yet. In Firebase Console open Storage → Get started, then run: firebase deploy --only storage',
        })
        return
      }

      sendHttpError(res, err)
    }
  },
)

exports.quoteCheckoutShipping = onRequest(
  {
    region,
    cors: true,
    invoker: 'public',
    secrets: [stripeSecretKey, shippoApiTokenSecret, shipFromJsonSecret],
    timeoutSeconds: 60,
  },
  async (req, res) => {
    if (req.method === 'OPTIONS') {
      res.status(204).send('')
      return
    }

    if (req.method !== 'POST') {
      sendMethodNotAllowed(res, 'POST')
      return
    }

    const items = req.body?.items
    if (!Array.isArray(items) || items.length === 0 || items.length > 20) {
      res.status(400).json({ error: 'Cart is empty or too large' })
      return
    }

    const destination = parseDestinationAddress(req.body?.address)
    if (!destination) {
      res.status(400).json({ error: 'Enter a complete US shipping address (street, city, state, ZIP).' })
      return
    }

    try {
      const lineItems = []
      let subtotalCents = 0

      for (const item of items) {
        const stripePriceId = String(item?.stripePriceId ?? '').trim()
        const quantity = parseQuantity(item?.quantity)
        if (!stripePriceId.startsWith('price_') || quantity == null) {
          res.status(400).json({ error: 'Invalid cart item' })
          return
        }

        const price = await getStripe().prices.retrieve(stripePriceId)
        if (!price.active) {
          res.status(400).json({ error: 'Invalid cart item' })
          return
        }

        if (typeof price.unit_amount === 'number') {
          subtotalCents += price.unit_amount * quantity
        }

        lineItems.push({ price: stripePriceId, quantity })
      }

      const [productsByPrice, catalog] = await Promise.all([
        loadProductsByStripePriceIds(lineItems.map((item) => item.price)),
        loadShippingCatalog(),
      ])

      const quoteLines = lineItems.map((item) => {
        const product = productsByPrice.get(item.price) || {}
        return {
          quantity: item.quantity,
          product: {
            name: product.name,
            productTypeId: product.productTypeId,
            shipClass: product.shipClass,
            weightOz: product.weightOz,
            thicknessIn: product.thicknessIn,
            maxLetterQty: product.maxLetterQty,
          },
        }
      })

      const quote = await buildCheckoutShippingQuote({
        quoteLines,
        productTypes: catalog.productTypes,
        shippingTypes: catalog.shippingTypes,
        destination,
      })

      res.json({
        mode: quote.mode,
        message: quote.message,
        packaging: {
          packageType: quote.packaging.packageType,
          postageMode: quote.packaging.postageMode,
          weightOz: quote.packaging.weightOz,
          reason: quote.packaging.reason,
        },
        recommendedRateId: quote.recommendedRateId,
        rates: quote.rates,
        subtotalCents,
        addressValidation: quote.addressValidation
          ? {
              isValid: quote.addressValidation.isValid,
              messages: quote.addressValidation.messages || [],
            }
          : null,
        validatedAddress: quote.validatedAddress || destination,
      })
    } catch (err) {
      console.error('Checkout shipping quote error:', err)
      if (err.code === 'address_invalid' && err.addressValidation) {
        res.status(400).json({
          error: err.message,
          addressValidation: {
            isValid: false,
            messages: err.addressValidation.messages || [err.message],
          },
        })
        return
      }
      sendHttpError(res, err)
    }
  },
)

exports.createCheckoutSession = onRequest(
  {
    region,
    cors: true,
    invoker: 'public',
    secrets: [stripeSecretKey],
    timeoutSeconds: 60,
  },
  async (req, res) => {
  if (req.method === 'OPTIONS') {
    res.status(204).send('')
    return
  }

  if (req.method !== 'POST') {
    sendMethodNotAllowed(res, 'POST')
    return
  }

  const items = req.body?.items

  if (!Array.isArray(items) || items.length === 0 || items.length > 20) {
    res.status(400).json({ error: 'Cart is empty or too large' })
    return
  }

  try {
    const prepared = []

    for (const item of items) {
      const stripePriceId = String(item?.stripePriceId ?? '').trim()
      const quantity = parseQuantity(item?.quantity)
      const productId = String(item?.productId ?? '').trim()
      const productName = String(item?.productName ?? '').trim()
      const selectedOptions = Array.isArray(item?.selectedOptions) ? item.selectedOptions : []

      if (!stripePriceId.startsWith('price_') || quantity == null) {
        res.status(400).json({ error: 'Invalid cart item' })
        return
      }

      const price = await getStripe().prices.retrieve(stripePriceId)

      if (!price.active) {
        res.status(400).json({ error: 'Invalid cart item' })
        return
      }

      const optionsDelta = selectedOptions.reduce(
        (sum, option) => sum + Math.round(Number(option?.priceDeltaCents) || 0),
        0,
      )
      const optionsLabel = selectedOptions
        .map((option) => {
          const group = String(option?.groupName || '').trim()
          const choice = String(option?.choiceLabel || '').trim()
          if (!group || !choice) return ''
          return `${group}: ${choice}`
        })
        .filter(Boolean)
        .join(' · ')

      if (selectedOptions.length > 0 || optionsDelta !== 0) {
        const baseAmount = typeof price.unit_amount === 'number' ? price.unit_amount : 0
        const displayName = optionsLabel
          ? `${productName || 'Item'} (${optionsLabel})`
          : productName || 'Item'

        prepared.push({
          stripeLine: {
            price_data: {
              currency: price.currency || 'usd',
              unit_amount: Math.max(0, baseAmount + optionsDelta),
              tax_behavior: price.tax_behavior || 'exclusive',
              product_data: {
                name: displayName.slice(0, 250),
                metadata: {
                  productId: productId.slice(0, 500),
                  stripePriceId,
                  selectedOptions: JSON.stringify(selectedOptions).slice(0, 500),
                },
              },
            },
            quantity,
          },
          catalogPriceId: stripePriceId,
          productId,
        })
      } else {
        prepared.push({
          stripeLine: {
            price: stripePriceId,
            quantity,
          },
          catalogPriceId: stripePriceId,
          productId,
        })
      }
    }

    const lineItems = prepared.map((entry) => entry.stripeLine)

    const clientUrl = getClientUrl(req.get('origin'))
    const decoded = await verifyOptionalAuthToken(req)
    const metadata = {
      source: 'okonani',
    }

    if (decoded?.uid) {
      metadata.firebaseUid = decoded.uid
    }

    const catalogPriceIds = prepared.map((entry) => entry.catalogPriceId)
    const productIds = prepared.map((entry) => entry.productId).filter(Boolean)
    const [productsByPrice, productsById, catalog] = await Promise.all([
      loadProductsByStripePriceIds(catalogPriceIds),
      loadProductsByIds(productIds),
      loadShippingCatalog(),
    ])

    for (const product of productsByPrice.values()) {
      if (product?.id && !productsById.has(product.id)) {
        productsById.set(product.id, product)
      }
    }

    const stockCheck = validateStockAvailability(
      productsById,
      aggregateQuantityByProductId(
        prepared.map((entry) => {
          const fromPrice = productsByPrice.get(entry.catalogPriceId)
          return {
            productId: entry.productId || fromPrice?.id || '',
            quantity: entry.stripeLine.quantity,
          }
        }),
      ),
    )
    if (!stockCheck.ok) {
      res.status(400).json({ error: stockCheck.error })
      return
    }

    const quoteLines = prepared.map((entry) => {
      const product =
        (entry.productId && productsById.get(entry.productId)) ||
        productsByPrice.get(entry.catalogPriceId) ||
        {}
      return {
        quantity: entry.stripeLine.quantity,
        product: {
          name: product.name,
          productTypeId: product.productTypeId,
          shipClass: product.shipClass,
          weightOz: product.weightOz,
          thicknessIn: product.thicknessIn,
          maxLetterQty: product.maxLetterQty,
        },
      }
    })

    const letterSettings = letterSettingsFromCatalog(catalog.shippingTypes)
    const packaging = decidePackaging(
      quoteLines,
      catalog.productTypes,
      letterSettings.letterMaxItems,
    )
    metadata.packageType = packaging.packageType
    metadata.letterAvailable =
      packaging.packageType === 'envelope' && packaging.postageMode === 'stamp' ? 'true' : 'false'

    const sessionParams = {
      mode: 'payment',
      ui_mode: 'embedded_page',
      return_url: `${clientUrl}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
      line_items: lineItems,
      metadata,
      automatic_tax: {
        enabled: true,
      },
      // Collect enough address info for Stripe Tax even before shipping is confirmed.
      billing_address_collection: 'auto',
      permissions: {
        update_shipping_details: 'server_only',
      },
      shipping_address_collection: {
        allowed_countries: ['US'],
      },
      phone_number_collection: {
        enabled: true,
      },
      // Replaced with Shippo (and letter) rates after the customer enters their address.
      shipping_options: [dummyStripeShippingOption()],
    }

    const promotionCode =
      typeof req.body?.promotionCode === 'string' ? req.body.promotionCode.trim() : ''
    const rewardId = typeof req.body?.rewardId === 'string' ? req.body.rewardId.trim() : ''

    let appliedPromotionCodeId = null

    if (promotionCode) {
      appliedPromotionCodeId = await resolvePromotionCodeId(getStripe(), promotionCode)
    } else if (decoded?.uid && rewardId) {
      const reward = await getActiveReward(decoded.uid, rewardId)

      if (reward?.stripePromotionCodeId) {
        appliedPromotionCodeId = reward.stripePromotionCodeId
        metadata.rewardId = rewardId
      }
    }

    if (appliedPromotionCodeId) {
      sessionParams.discounts = [{ promotion_code: appliedPromotionCodeId }]
    } else {
      sessionParams.allow_promotion_codes = true
    }

    const session = await getStripe().checkout.sessions.create(sessionParams)

    if (!session.client_secret) {
      res.status(500).json({ error: 'Checkout session missing client secret' })
      return
    }

    res.json({ clientSecret: session.client_secret, sessionId: session.id })
  } catch (err) {
    console.error('Checkout session error:', err)
    sendHttpError(res, err)
  }
})

/**
 * Embedded Checkout: after address entry, quote Shippo (+ letter if eligible) and update the session.
 */
exports.updateCheckoutShipping = onRequest(
  {
    region,
    cors: true,
    invoker: 'public',
    secrets: [stripeSecretKey, shippoApiTokenSecret, shipFromJsonSecret],
    timeoutSeconds: 60,
  },
  async (req, res) => {
    if (req.method === 'OPTIONS') {
      res.status(204).send('')
      return
    }

    if (req.method !== 'POST') {
      sendMethodNotAllowed(res, 'POST')
      return
    }

    try {
      const checkoutSessionId = String(
        req.body?.checkout_session_id || req.body?.checkoutSessionId || '',
      ).trim()
      const shippingDetails = req.body?.shipping_details || req.body?.shippingDetails

      if (!checkoutSessionId.startsWith('cs_')) {
        res.status(400).json({ type: 'error', message: 'Missing checkout session id.' })
        return
      }

      const destination = parseDestinationAddress(shippingDetails)
      if (!destination) {
        res.status(400).json({
          type: 'error',
          message: 'Enter a complete US shipping address (street, city, state, ZIP).',
        })
        return
      }

      const session = await getStripe().checkout.sessions.retrieve(checkoutSessionId, {
        expand: ['line_items.data.price'],
      })
      if (session.status !== 'open') {
        res.status(400).json({ type: 'error', message: 'This checkout session is no longer open.' })
        return
      }

      const lineItems = session.line_items?.data || []
      if (lineItems.length === 0) {
        res.status(400).json({ type: 'error', message: 'Could not load cart items for shipping.' })
        return
      }

      const priceIds = lineItems
        .map((item) => {
          const price = item.price
          return typeof price === 'string' ? price : price?.id
        })
        .filter(Boolean)

      const [productsByPrice, catalog] = await Promise.all([
        loadProductsByStripePriceIds(priceIds),
        loadShippingCatalog(),
      ])

      const quoteLines = lineItems.map((item) => {
        const priceId = typeof item.price === 'string' ? item.price : item.price?.id
        const product = productsByPrice.get(priceId) || {}
        return {
          quantity: item.quantity || 1,
          product: {
            name: product.name,
            productTypeId: product.productTypeId,
            shipClass: product.shipClass,
            weightOz: product.weightOz,
            thicknessIn: product.thicknessIn,
            maxLetterQty: product.maxLetterQty,
          },
        }
      })

      const quote = await buildCheckoutShippingQuote({
        quoteLines,
        productTypes: catalog.productTypes,
        shippingTypes: catalog.shippingTypes,
        destination,
      })

      const shippingOptions = ratesToStripeShippingOptions(quote.rates)
      if (shippingOptions.length === 0) {
        res.status(400).json({
          type: 'error',
          message: 'No shipping options available for that address. Try a different address.',
        })
        return
      }

      await getStripe().checkout.sessions.update(checkoutSessionId, {
        collected_information: {
          shipping_details: toStripeCollectedShippingDetails(shippingDetails, destination),
        },
        shipping_options: shippingOptions,
        metadata: {
          ...session.metadata,
          letterAvailable: quote.letterAvailable ? 'true' : 'false',
          shippoShipmentId: quote.shipmentId || '',
        },
      })

      res.json({ type: 'object', value: { succeeded: true } })
    } catch (err) {
      console.error('Update checkout shipping error:', err)
      const message =
        err.code === 'address_invalid'
          ? err.message
          : err.message || 'Could not calculate shipping for that address.'
      res.status(err.status && err.status < 500 ? err.status : 500).json({
        type: 'error',
        message,
      })
    }
  },
)


exports.getCheckoutSession = onRequest({ region, cors: true, invoker: 'public', secrets: [stripeSecretKey] }, async (req, res) => {
  if (req.method === 'OPTIONS') {
    res.status(204).send('')
    return
  }

  if (req.method !== 'GET') {
    sendMethodNotAllowed(res, 'GET')
    return
  }

  const sessionId = req.query.session_id

  if (typeof sessionId !== 'string') {
    res.status(400).json({ error: 'Missing session_id' })
    return
  }

  try {
    const session = await getStripe().checkout.sessions.retrieve(sessionId)

    res.json({
      status: session.status,
      paymentStatus: session.payment_status,
      email: session.customer_details?.email ?? null,
      amountTotal: session.amount_total,
      pointsEarned: pointsForAmountCents(session.amount_total ?? 0),
      earnedPoints: session.metadata?.firebaseUid ? true : false,
    })
  } catch (err) {
    console.error('Session retrieve error:', err)
    res.status(500).json({ error: 'Could not load checkout session' })
  }
})

exports.stripeWebhook = onRequest(
  {
    region,
    invoker: 'public',
    secrets: [
      stripeSecretKey,
      stripeWebhookSecret,
      resendApiKeySecret,
      mailFromSecret,
      orderNotifyEmailSecret,
      clientUrlSecret,
      adminEmailsSecret,
    ],
  },
  async (req, res) => {
  if (req.method !== 'POST') {
    sendMethodNotAllowed(res, 'POST')
    return
  }

  const webhookSecret = getWebhookSecret()
  if (!webhookSecret) {
    res.status(503).send('Webhook secret not configured')
    return
  }

  const signature = req.get('stripe-signature')

  if (!signature) {
    res.status(400).send('Missing Stripe signature')
    return
  }

  let event

  try {
    event = getStripe().webhooks.constructEvent(req.rawBody, signature, webhookSecret)
  } catch (err) {
    console.error('Webhook verification error:', err)
    res.status(400).send(`Webhook Error: ${err.message}`)
    return
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object

    try {
      const orderResult = await persistCheckoutOrder(getStripe(), session)
      console.log('Order persisted:', session.id, orderResult)

      try {
        const stockResult = await deductStockForCheckoutSession(getStripe(), session)
        console.log('Stock deducted:', session.id, stockResult)
      } catch (stockErr) {
        console.error('Stock deduction error:', session.id, stockErr)
      }

      if (orderResult?.isNew && orderResult.order) {
        const mailResult = await sendNewOrderAdminEmail(orderResult.order)
        console.log('New order admin email:', session.id, mailResult)
      }
    } catch (err) {
      console.error('Order persist error:', session.id, err)
    }

    try {
      const result = await awardPointsForCheckoutSession(getStripe(), session)
      console.log('Checkout completed:', session.id, session.payment_status, 'points:', result.awarded)
    } catch (err) {
      console.error('Points award error:', session.id, err)
    }
  }

  res.json({ received: true })
})

exports.redeemPoints = onRequest({ region, cors: true, invoker: 'public', secrets: [stripeSecretKey] }, async (req, res) => {
  if (req.method === 'OPTIONS') {
    res.status(204).send('')
    return
  }

  if (req.method !== 'POST') {
    sendMethodNotAllowed(res, 'POST')
    return
  }

  try {
    const decoded = await verifyAuthToken(req)
    const result = await redeemPointsForCoupon(getStripe(), decoded.uid)

    res.json(result)
  } catch (err) {
    sendHttpError(res, err)
  }
})

exports.getRewardsSummary = onRequest({ region, cors: true, invoker: 'public' }, async (req, res) => {
  if (req.method === 'OPTIONS') {
    res.status(204).send('')
    return
  }

  if (req.method !== 'GET') {
    sendMethodNotAllowed(res, 'GET')
    return
  }

  try {
    const decoded = await verifyAuthToken(req)
    const [points, rewards] = await Promise.all([
      getUserPoints(decoded.uid),
      listActiveRewards(decoded.uid),
    ])

    res.json({
      points,
      pointsPerDollar: POINTS_PER_DOLLAR,
      redeemPointsCost: REDEEM_POINTS_COST,
      redeemDiscountCents: REDEEM_DISCOUNT_CENTS,
      activeRewards: rewards.map((reward) => ({
        id: reward.id,
        code: reward.code,
        discountCents: reward.discountCents,
        pointsSpent: reward.pointsSpent,
      })),
    })
  } catch (err) {
    sendHttpError(res, err)
  }
})

exports.getSocialFeeds = onRequest({ ...httpOptions }, async (req, res) => {
  if (req.method === 'OPTIONS') {
    res.status(204).send('')
    return
  }

  if (req.method !== 'GET') {
    sendMethodNotAllowed(res, 'GET')
    return
  }

  try {
    const force = req.query.refresh === '1'
    const feeds = await getSocialFeeds({ force })
    res.json(feeds)
  } catch (err) {
    sendHttpError(res, err)
  }
})

function serializeAdminTimestamp(value) {
  if (value && typeof value.toDate === 'function') {
    return value.toDate().toISOString()
  }
  return typeof value === 'string' ? value : null
}

exports.adminListOrders = onRequest(
  { ...httpOptions, secrets: [adminEmailsSecret, stripeSecretKey] },
  async (req, res) => {
  if (req.method === 'OPTIONS') {
    res.status(204).send('')
    return
  }

  if (req.method !== 'GET') {
    sendMethodNotAllowed(res, 'GET')
    return
  }

  try {
    await requireAdminRequest(req)

    const snapshot = await getFirestore().collection('orders').orderBy('createdAt', 'desc').get()

    const orders = await Promise.all(
      snapshot.docs.map(async (docSnap) => {
        let data = docSnap.data()

        // Backfill addresses saved before we read collected_information.shipping_details
        if (!data.shippingAddress?.line1 && String(docSnap.id).startsWith('cs_')) {
          try {
            const session = await getStripe().checkout.sessions.retrieve(docSnap.id)
            const shipping = resolveShippingAddress(session)
            if (shipping?.line1) {
              const patch = {
                shippingAddress: shipping,
                customerName: shipping.name || data.customerName || '',
                updatedAt: FieldValue.serverTimestamp(),
              }
              if (!data.phone && session.customer_details?.phone) {
                patch.phone = session.customer_details.phone
              }
              await docSnap.ref.set(patch, { merge: true })
              data = { ...data, ...patch, updatedAt: data.updatedAt }
              data.shippingAddress = shipping
              if (patch.customerName) data.customerName = patch.customerName
              if (patch.phone) data.phone = patch.phone
            }
          } catch (err) {
            console.warn('Order address backfill failed:', docSnap.id, err?.message || err)
          }
        }

        return {
          id: docSnap.id,
          ...data,
          createdAt: serializeAdminTimestamp(data.createdAt),
          shippedAt: serializeAdminTimestamp(data.shippedAt),
          deliveredAt: serializeAdminTimestamp(data.deliveredAt),
          trackingUpdatedAt: serializeAdminTimestamp(data.trackingUpdatedAt),
          updatedAt: serializeAdminTimestamp(data.updatedAt),
        }
      }),
    )

    res.json({ orders })
  } catch (err) {
    sendHttpError(res, err)
  }
})

function resolveOrderPackaging(orderData, packageTypeOverride) {
  const suggestion = orderData.packagingSuggestion || suggestPackaging(
    (orderData.items || []).map((item) => ({
      quantity: item.quantity,
      product: {
        name: item.name,
        shipClass: item.shipClass,
        weightOz: item.weightOz ?? undefined,
        thicknessIn: item.thicknessIn ?? undefined,
        maxLetterQty: item.maxLetterQty ?? undefined,
      },
    })),
  )

  const packageType = packageTypeOverride || orderData.packageType || suggestion.packageType
  const override = packagingOverride(packageType)

  return {
    ...suggestion,
    ...override,
    weightOz: suggestion.weightOz || 1,
    dims: override.dims || PACKAGE_DIMS[override.packageType] || PACKAGE_DIMS.bubble_mailer,
  }
}

exports.adminOrderRates = onRequest(
  { ...httpOptions, secrets: [adminEmailsSecret, shippoApiTokenSecret, shipFromJsonSecret], timeoutSeconds: 60 },
  async (req, res) => {
  if (req.method === 'OPTIONS') {
    res.status(204).send('')
    return
  }

  if (req.method !== 'POST') {
    sendMethodNotAllowed(res, 'POST')
    return
  }

  try {
    await requireAdminRequest(req)

    const orderId = String(req.body?.orderId ?? '').trim()
    if (!orderId) {
      res.status(400).json({ error: 'orderId is required' })
      return
    }

    const orderSnap = await getFirestore().collection('orders').doc(orderId).get()
    if (!orderSnap.exists) {
      res.status(404).json({ error: 'Order not found' })
      return
    }

    const order = orderSnap.data()
    if (!order.shippingAddress?.line1) {
      res.status(400).json({ error: 'Order has no shipping address' })
      return
    }

    const packaging = resolveOrderPackaging(order, req.body?.packageType)

    if (packaging.postageMode === 'stamp') {
      res.json({
        postageMode: 'stamp',
        packaging,
        rates: [],
        recommendedRateId: null,
        message: 'This order is letter-eligible. Use a stamp instead of buying a carrier label.',
      })
      return
    }

    const result = await createShipmentRates({
      toAddress: {
        ...order.shippingAddress,
        email: order.email || '',
        phone: order.phone || order.shippingAddress.phone || '',
      },
      dims: packaging.dims,
      weightOz: packaging.weightOz,
      shippingRateName: order.shippingRateName || '',
    })

    res.json({
      postageMode: 'label',
      packaging,
      ...result,
    })
  } catch (err) {
    sendHttpError(res, err)
  }
})

exports.adminOrderLabel = onRequest(
  { ...httpOptions, secrets: [adminEmailsSecret, shippoApiTokenSecret, shipFromJsonSecret, resendApiKeySecret, mailFromSecret], timeoutSeconds: 120 },
  async (req, res) => {
    if (req.method === 'OPTIONS') {
      res.status(204).send('')
      return
    }

    if (req.method !== 'POST') {
      sendMethodNotAllowed(res, 'POST')
      return
    }

    try {
      await requireAdminRequest(req)

      const orderId = String(req.body?.orderId ?? '').trim()
      let rateId = String(req.body?.rateId ?? '').trim()
      const packageType = req.body?.packageType

      if (!orderId) {
        res.status(400).json({ error: 'orderId is required' })
        return
      }

      const orderRef = getFirestore().collection('orders').doc(orderId)
      const orderSnap = await orderRef.get()

      if (!orderSnap.exists) {
        res.status(404).json({ error: 'Order not found' })
        return
      }

      const order = orderSnap.data()
      if (!order.shippingAddress?.line1) {
        res.status(400).json({ error: 'Order has no shipping address' })
        return
      }

      const packaging = resolveOrderPackaging(order, packageType)

      if (packaging.postageMode === 'stamp') {
        res.status(400).json({
          error: 'This order is letter-eligible. Mark it fulfilled with a stamp instead of buying a label.',
        })
        return
      }

      if (!rateId) {
        const rates = await createShipmentRates({
          toAddress: {
            ...order.shippingAddress,
            email: order.email || '',
            phone: order.phone || order.shippingAddress.phone || '',
          },
          dims: packaging.dims,
          weightOz: packaging.weightOz,
          shippingRateName: order.shippingRateName || '',
        })
        rateId = rates.recommendedRateId
      }

      if (!rateId) {
        res.status(400).json({ error: 'No shipping rate available for this package' })
        return
      }

      const label = await purchaseLabel(rateId)

      if (label.trackingNumber) {
        await registerTracking({
          carrier: label.carrier,
          trackingNumber: label.trackingNumber,
          metadata: orderId,
        })
      }

      const customerName =
        order.customerName || order.shippingAddress?.name || order.email || ''

      await orderRef.set(
        {
          packageType: packaging.packageType,
          postageMode: 'label',
          labelUrl: label.labelUrl,
          trackingNumber: label.trackingNumber,
          trackingUrl: label.trackingUrl,
          carrier: label.carrier,
          shippoTransactionId: label.transactionId,
          trackingStatus: 'PRE_TRANSIT',
          trackingStatusDetail: 'Label created',
          trackingUpdatedAt: FieldValue.serverTimestamp(),
          fulfillmentStatus: 'fulfilled',
          shippedAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true },
      )

      const mailResult = await sendShippingConfirmationEmail({
        to: order.email,
        customerName,
        orderId,
        carrier: label.carrier,
        trackingNumber: label.trackingNumber,
        trackingUrl: label.trackingUrl,
      })

      res.json({
        ok: true,
        labelUrl: label.labelUrl,
        trackingNumber: label.trackingNumber,
        trackingUrl: label.trackingUrl,
        carrier: label.carrier,
        packaging,
        emailSent: mailResult.sent === true,
        emailNote: mailResult.sent ? null : mailResult.reason || null,
      })
    } catch (err) {
      sendHttpError(res, err)
    }
  },
)

/**
 * Shippo webhook for tracking updates.
 * Configure in Shippo: Settings → Webhooks → track_updated
 * URL: https://us-central1-<project>.cloudfunctions.net/shippoWebhook
 */
exports.shippoWebhook = onRequest(
  { region, invoker: 'public', secrets: [shippoApiTokenSecret, shipFromJsonSecret, resendApiKeySecret, mailFromSecret], timeoutSeconds: 60 },
  async (req, res) => {
    if (req.method === 'OPTIONS') {
      res.status(204).send('')
      return
    }

    if (req.method !== 'POST') {
      sendMethodNotAllowed(res, 'POST')
      return
    }

    try {
      const event = typeof req.body?.event === 'string' ? req.body.event : ''
      const data = req.body?.data && typeof req.body.data === 'object' ? req.body.data : req.body

      if (event && event !== 'track_updated' && event !== 'TrackUpdated') {
        res.json({ ok: true, ignored: event })
        return
      }

      const trackingNumber =
        typeof data?.tracking_number === 'string'
          ? data.tracking_number
          : typeof data?.trackingNumber === 'string'
            ? data.trackingNumber
            : ''

      if (!trackingNumber) {
        res.status(400).json({ error: 'Missing tracking_number' })
        return
      }

      const status =
        normalizeTrackingStatus(data.tracking_status) ||
        normalizeTrackingStatus(data.status) ||
        'UNKNOWN'
      const statusDetail =
        (data.tracking_status && typeof data.tracking_status.status_details === 'string'
          ? data.tracking_status.status_details
          : null) ||
        (typeof data.status_details === 'string' ? data.status_details : '') ||
        status

      const trackingUrl =
        typeof data.tracking_url_provider === 'string'
          ? data.tracking_url_provider
          : typeof data.trackingUrl === 'string'
            ? data.trackingUrl
            : null

      const metadata = typeof data.metadata === 'string' ? data.metadata.trim() : ''
      const db = getFirestore()
      let orderRef = null

      if (metadata) {
        const byId = await db.collection('orders').doc(metadata).get()
        if (byId.exists) orderRef = byId.ref
      }

      if (!orderRef) {
        const snap = await db
          .collection('orders')
          .where('trackingNumber', '==', trackingNumber)
          .limit(1)
          .get()
        if (!snap.empty) orderRef = snap.docs[0].ref
      }

      if (!orderRef) {
        res.json({ ok: true, matched: false, trackingNumber, status })
        return
      }

      const orderSnap = await orderRef.get()
      const order = orderSnap.data() || {}
      const updates = {
        trackingStatus: status,
        trackingStatusDetail: statusDetail,
        trackingUpdatedAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      }

      if (trackingUrl) updates.trackingUrl = trackingUrl

      if (status === 'DELIVERED') {
        updates.deliveredAt = FieldValue.serverTimestamp()
        if (order.fulfillmentStatus !== 'fulfilled') {
          updates.fulfillmentStatus = 'fulfilled'
        }
      } else if (
        ['TRANSIT', 'IN_TRANSIT', 'OUT_FOR_DELIVERY', 'PRE_TRANSIT'].includes(status) &&
        order.fulfillmentStatus === 'unfulfilled'
      ) {
        updates.fulfillmentStatus = 'fulfilled'
        if (!order.shippedAt) updates.shippedAt = FieldValue.serverTimestamp()
      }

      await orderRef.set(updates, { merge: true })

      if (status === 'DELIVERED' && order.email && !order.deliveredEmailSent) {
        await sendDeliveredEmail({
          to: order.email,
          customerName: order.customerName || order.shippingAddress?.name || '',
          orderId: orderRef.id,
          trackingUrl: trackingUrl || order.trackingUrl || null,
        })
        await orderRef.set({ deliveredEmailSent: true }, { merge: true })
      }

      res.json({ ok: true, matched: true, orderId: orderRef.id, status })
    } catch (err) {
      console.error('Shippo webhook error:', err)
      sendHttpError(res, err)
    }
  },
)
