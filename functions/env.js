const fs = require('node:fs')
const path = require('node:path')
const { defineSecret } = require('firebase-functions/params')

const rootEnvPath = path.join(__dirname, '../.env')
const adminEmailsSecret = defineSecret('ADMIN_EMAILS')
const shippoApiTokenSecret = defineSecret('SHIPPO_API_TOKEN')
const shipFromJsonSecret = defineSecret('SHIP_FROM_JSON')
const resendApiKeySecret = defineSecret('RESEND_API_KEY')
const mailFromSecret = defineSecret('MAIL_FROM')
const orderNotifyEmailSecret = defineSecret('ORDER_NOTIFY_EMAIL')
const clientUrlSecret = defineSecret('CLIENT_URL')

function loadRootEnv() {
  if (!fs.existsSync(rootEnvPath)) return

  for (const line of fs.readFileSync(rootEnvPath, 'utf8').split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue

    const eq = trimmed.indexOf('=')
    if (eq === -1) continue

    const key = trimmed.slice(0, eq).trim()
    let value = trimmed.slice(eq + 1).trim()

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }

    if (process.env[key] === undefined) {
      process.env[key] = value
    }
  }
}

loadRootEnv()

function getConfig(key) {
  const fromEnv = process.env[key]
  if (fromEnv !== undefined && fromEnv !== '') return fromEnv

  // Cloud Functions secrets (bound on the function) land in process.env after injection;
  // also try explicit secret params when local .env is missing the key.
  if (key === 'RESEND_API_KEY') return safeSecretValue(resendApiKeySecret)
  if (key === 'MAIL_FROM') return safeSecretValue(mailFromSecret)
  if (key === 'ORDER_NOTIFY_EMAIL') return safeSecretValue(orderNotifyEmailSecret)
  if (key === 'CLIENT_URL') return safeSecretValue(clientUrlSecret)
  return ''
}

function getClientUrl(fallback) {
  return getConfig('CLIENT_URL') || fallback || 'http://localhost:5173'
}

/**
 * Canonical public site URL for Stripe return_url.
 * Prefer the shopper's origin, then CLIENT_URL — never localhost in production,
 * and map www.okonani.com → okonani.com (www currently has a broken TLS cert).
 */
function resolveCheckoutClientUrl(req) {
  const bodyOrigin =
    req?.body && typeof req.body.returnOrigin === 'string' ? req.body.returnOrigin.trim() : ''
  const headerOrigin = String(req?.get?.('origin') || '').trim()
  const configured = getClientUrl('').trim()

  const candidates = [bodyOrigin, headerOrigin, configured, 'https://okonani.com']

  for (const candidate of candidates) {
    const normalized = normalizePublicSiteUrl(candidate)
    if (normalized) return normalized
  }

  return 'https://okonani.com'
}

function normalizePublicSiteUrl(value) {
  if (!value || typeof value !== 'string') return null
  let raw = value.trim().replace(/\/$/, '')
  if (!raw) return null

  try {
    if (!/^https?:\/\//i.test(raw)) raw = `https://${raw}`
    const url = new URL(raw)
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null

    const host = url.hostname.toLowerCase()
    if (host === 'localhost' || host === '127.0.0.1') {
      // Allow only for local development when CLIENT_URL is also local.
      const configured = getClientUrl('').toLowerCase()
      if (configured.includes('localhost') || configured.includes('127.0.0.1')) {
        return `${url.protocol}//${url.host}`
      }
      return null
    }

    // www.okonani.com cert is broken — always send shoppers to apex.
    if (host === 'www.okonani.com') {
      return 'https://okonani.com'
    }

    if (host === 'okonani.com') {
      return 'https://okonani.com'
    }

    if (host.endsWith('.web.app') || host.endsWith('.firebaseapp.com')) {
      return `https://${host}`
    }

    // Other https origins (staging, etc.)
    if (url.protocol === 'https:') {
      return `https://${url.host}`
    }
  } catch {
    return null
  }

  return null
}

function safeSecretValue(secret) {
  try {
    return secret.value()
  } catch {
    return ''
  }
}

function getAdminEmails() {
  const raw = getConfig('ADMIN_EMAILS') || safeSecretValue(adminEmailsSecret)
  return raw
    .split(',')
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean)
}

function getStripeSecretKey() {
  return getConfig('STRIPE_SECRET_KEY')
}

function getStripeWebhookSecret() {
  return getConfig('STRIPE_WEBHOOK_SECRET')
}

function getShippoToken() {
  return (getConfig('SHIPPO_API_TOKEN') || safeSecretValue(shippoApiTokenSecret)).trim()
}

function getShipFromAddress() {
  let fromJson = {}
  const rawJson = getConfig('SHIP_FROM_JSON') || safeSecretValue(shipFromJsonSecret)
  if (rawJson) {
    try {
      fromJson = JSON.parse(rawJson)
    } catch {
      fromJson = {}
    }
  }

  return {
    name: String(fromJson.name || getConfig('SHIP_FROM_NAME') || 'okonani').trim(),
    street1: String(fromJson.street1 || getConfig('SHIP_FROM_STREET1') || '').trim(),
    street2: String(fromJson.street2 || getConfig('SHIP_FROM_STREET2') || '').trim(),
    city: String(fromJson.city || getConfig('SHIP_FROM_CITY') || '').trim(),
    state: String(fromJson.state || getConfig('SHIP_FROM_STATE') || '')
      .trim()
      .toUpperCase(),
    zip: String(fromJson.zip || getConfig('SHIP_FROM_ZIP') || '').trim(),
    country:
      String(fromJson.country || getConfig('SHIP_FROM_COUNTRY') || 'US')
        .trim()
        .toUpperCase() || 'US',
    phone: String(fromJson.phone || getConfig('SHIP_FROM_PHONE') || '').trim(),
    email: String(fromJson.email || getConfig('SHIP_FROM_EMAIL') || '').trim(),
  }
}

function getProjectId() {
  return (
    process.env.GCLOUD_PROJECT ||
    process.env.GOOGLE_CLOUD_PROJECT ||
    getConfig('VITE_FIREBASE_PROJECT_ID') ||
    'okonani-dff36'
  )
}

function getStorageBucketName() {
  return (
    getConfig('VITE_FIREBASE_STORAGE_BUCKET') ||
    getConfig('FIREBASE_STORAGE_BUCKET') ||
    `${getProjectId()}.firebasestorage.app`
  )
}

module.exports = {
  loadRootEnv,
  adminEmailsSecret,
  shippoApiTokenSecret,
  shipFromJsonSecret,
  resendApiKeySecret,
  mailFromSecret,
  orderNotifyEmailSecret,
  clientUrlSecret,
  getConfig,
  getAdminEmails,
  getStripeSecretKey,
  getStripeWebhookSecret,
  getShippoToken,
  getShipFromAddress,
  getClientUrl,
  resolveCheckoutClientUrl,
  getProjectId,
  getStorageBucketName,
}
