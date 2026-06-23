const fs = require('node:fs')
const path = require('node:path')
const { defineSecret } = require('firebase-functions/params')

const rootEnvPath = path.join(__dirname, '../.env')
const adminEmailsSecret = defineSecret('ADMIN_EMAILS')

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
  return process.env[key] ?? ''
}

function getAdminEmails() {
  const raw = getConfig('ADMIN_EMAILS') || safeSecretValue(adminEmailsSecret)
  return raw
    .split(',')
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean)
}

function safeSecretValue(secret) {
  try {
    return secret.value()
  } catch {
    return ''
  }
}

function getStripeSecretKey() {
  return getConfig('STRIPE_SECRET_KEY')
}

function getStripeWebhookSecret() {
  return getConfig('STRIPE_WEBHOOK_SECRET')
}

function getClientUrl(fallback) {
  return getConfig('CLIENT_URL') || fallback || 'http://localhost:5173'
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
  getAdminEmails,
  getStripeSecretKey,
  getStripeWebhookSecret,
  getClientUrl,
  getProjectId,
  getStorageBucketName,
}
