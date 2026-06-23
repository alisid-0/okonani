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

setSecret('STRIPE_SECRET_KEY', stripeSecretKey)
setSecret('STRIPE_WEBHOOK_SECRET', stripeWebhookSecret)
setSecret('ADMIN_EMAILS', adminEmails)

console.log('Secrets pushed from root .env to Firebase Secret Manager.')
