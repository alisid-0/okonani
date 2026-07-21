import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const envPath = join(__dirname, '../.env')

function readEnvValue(key) {
  const content = readFileSync(envPath, 'utf8')

  for (const line of content.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue

    const eq = trimmed.indexOf('=')
    if (eq === -1) continue

    if (trimmed.slice(0, eq).trim() === key) {
      return trimmed.slice(eq + 1).trim()
    }
  }

  return null
}

function setSecret(name, value) {
  if (!value || value.includes('...')) {
    console.error(`Missing or placeholder value for ${name} in .env`)
    process.exit(1)
  }

  console.log(`Setting secret ${name}...`)
  const result = spawnSync('firebase', ['functions:secrets:set', name], {
    input: value,
    stdio: ['pipe', 'inherit', 'inherit'],
    shell: true,
  })

  if (result.status !== 0) {
    process.exit(result.status ?? 1)
  }
}

const stripeSecretKey = readEnvValue('STRIPE_SECRET_KEY')
const stripeWebhookSecret = readEnvValue('STRIPE_WEBHOOK_SECRET')
const adminEmails = readEnvValue('ADMIN_EMAILS')
const shippoToken = readEnvValue('SHIPPO_API_TOKEN')
const resendApiKey = readEnvValue('RESEND_API_KEY')
const mailFrom = readEnvValue('MAIL_FROM')
const orderNotifyEmail = readEnvValue('ORDER_NOTIFY_EMAIL')
const clientUrl = readEnvValue('CLIENT_URL')

setSecret('STRIPE_SECRET_KEY', stripeSecretKey)
setSecret('STRIPE_WEBHOOK_SECRET', stripeWebhookSecret)
setSecret('ADMIN_EMAILS', adminEmails)

if (shippoToken && !shippoToken.includes('...')) {
  setSecret('SHIPPO_API_TOKEN', shippoToken)

  const shipFrom = {
    name: readEnvValue('SHIP_FROM_NAME') || 'okonani',
    street1: readEnvValue('SHIP_FROM_STREET1') || '',
    street2: readEnvValue('SHIP_FROM_STREET2') || '',
    city: readEnvValue('SHIP_FROM_CITY') || '',
    state: readEnvValue('SHIP_FROM_STATE') || '',
    zip: readEnvValue('SHIP_FROM_ZIP') || '',
    country: readEnvValue('SHIP_FROM_COUNTRY') || 'US',
    phone: readEnvValue('SHIP_FROM_PHONE') || '',
    email: readEnvValue('SHIP_FROM_EMAIL') || '',
  }

  if (!shipFrom.street1 || !shipFrom.city || !shipFrom.state || !shipFrom.zip) {
    console.error(
      'SHIP_FROM_STREET1, SHIP_FROM_CITY, SHIP_FROM_STATE, and SHIP_FROM_ZIP are required in .env to push SHIP_FROM_JSON',
    )
    process.exit(1)
  }

  setSecret('SHIP_FROM_JSON', JSON.stringify(shipFrom))
} else {
  console.log('Skipping Shippo secrets (SHIPPO_API_TOKEN not set).')
}

if (resendApiKey && !resendApiKey.includes('...')) {
  setSecret('RESEND_API_KEY', resendApiKey)
} else {
  console.log('Skipping RESEND_API_KEY (not set).')
}

if (mailFrom && !mailFrom.includes('...')) {
  setSecret('MAIL_FROM', mailFrom)
} else {
  console.log('Skipping MAIL_FROM (not set).')
}

if (orderNotifyEmail && !orderNotifyEmail.includes('...')) {
  setSecret('ORDER_NOTIFY_EMAIL', orderNotifyEmail)
} else {
  console.log('Skipping ORDER_NOTIFY_EMAIL (not set — falls back to ADMIN_EMAILS).')
}

if (clientUrl && !clientUrl.includes('...') && !clientUrl.includes('localhost')) {
  setSecret('CLIENT_URL', clientUrl)
} else if (clientUrl && clientUrl.includes('localhost')) {
  console.log('Skipping CLIENT_URL secret (localhost — set production URL in .env before push).')
} else {
  console.log('Skipping CLIENT_URL (not set).')
}

console.log('Secrets pushed from root .env to Firebase Secret Manager.')
