import { readFileSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { cert, getApps, initializeApp } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'

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

  return ''
}

function loadRootEnv() {
  const content = readFileSync(envPath, 'utf8')

  for (const line of content.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue

    const eq = trimmed.indexOf('=')
    if (eq === -1) continue

    const key = trimmed.slice(0, eq).trim()
    const value = trimmed.slice(eq + 1).trim()

    if (process.env[key] === undefined) {
      process.env[key] = value
    }
  }
}

function resolveServiceAccountPath() {
  const configured = readEnvValue('FIREBASE_SERVICE_ACCOUNT_PATH')
  if (!configured) return null

  const resolved = join(__dirname, '..', configured)
  return existsSync(resolved) ? resolved : null
}

function printCredentialHelp() {
  console.error(`
Could not authenticate with Firestore.

Option 1 — Manual (fastest, no script):
  Firebase Console → Firestore → Start collection "admins"
  Document ID: your-admin@gmail.com
  Field: email (string) = your-admin@gmail.com

Option 2 — Service account (for npm run bootstrap:admins):
  Firebase Console → Project settings → Service accounts
  → Generate new private key → save as firebase-service-account.json in project root
  Add to .env: FIREBASE_SERVICE_ACCOUNT_PATH=firebase-service-account.json
  Then run: npm run bootstrap:admins
`)
}

loadRootEnv()

if (process.env.VITE_USE_FIREBASE_EMULATORS === 'true' && !process.env.FIRESTORE_EMULATOR_HOST) {
  process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080'
}

const usingEmulator = process.env.FIRESTORE_EMULATOR_HOST != null
const serviceAccountPath = resolveServiceAccountPath()

if (getApps().length === 0) {
  const projectId = process.env.VITE_FIREBASE_PROJECT_ID || process.env.FIREBASE_PROJECT_ID

  if (serviceAccountPath) {
    const serviceAccount = JSON.parse(readFileSync(serviceAccountPath, 'utf8'))
    initializeApp({
      credential: cert(serviceAccount),
      projectId: projectId || serviceAccount.project_id,
    })
  } else {
    initializeApp({ projectId })
  }
}

const emails = readEnvValue('ADMIN_EMAILS')
  .split(',')
  .map((email) => email.trim().toLowerCase())
  .filter(Boolean)

if (emails.length === 0) {
  console.error('No ADMIN_EMAILS found in root .env')
  process.exit(1)
}

const db = getFirestore()
const batch = db.batch()

for (const email of emails) {
  batch.set(db.collection('admins').doc(email), { email, createdAt: new Date().toISOString() })
}

try {
  await batch.commit()
} catch (err) {
  if (!usingEmulator && !serviceAccountPath) {
    printCredentialHelp()
  }
  throw err
}

const target = usingEmulator
  ? `Firestore emulator (${process.env.FIRESTORE_EMULATOR_HOST})`
  : 'production Firestore'

console.log(`Bootstrapped ${emails.length} admin(s) into ${target}.`)
