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
const { getSocialFeeds } = require('./socialFeeds')

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

exports.createCheckoutSession = onRequest({ region, cors: true, invoker: 'public', secrets: [stripeSecretKey] }, async (req, res) => {
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
    const lineItems = []

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

      lineItems.push({
        price: stripePriceId,
        quantity,
      })
    }

    const clientUrl = getClientUrl(req.get('origin'))
    const decoded = await verifyOptionalAuthToken(req)
    const metadata = {
      source: 'okonani',
    }

    if (decoded?.uid) {
      metadata.firebaseUid = decoded.uid
    }

    const sessionParams = {
      mode: 'payment',
      line_items: lineItems,
      success_url: `${clientUrl}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${clientUrl}/checkout/cancel`,
      metadata,
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

    res.json({ url: session.url })
  } catch (err) {
    console.error('Checkout session error:', err)
    sendHttpError(res, err)
  }
})

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

exports.stripeWebhook = onRequest({ region, invoker: 'public', secrets: [stripeSecretKey, stripeWebhookSecret] }, async (req, res) => {
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
