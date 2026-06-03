import cors from 'cors'
import express from 'express'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import Stripe from 'stripe'

const __dirname = dirname(fileURLToPath(import.meta.url))
const products = JSON.parse(readFileSync(join(__dirname, '../data/products.json'), 'utf8'))
const productById = new Map(products.map((p) => [p.id, p]))

export function createStripeApp() {
  const stripeSecretKey = process.env.STRIPE_SECRET_KEY
  if (!stripeSecretKey) {
    throw new Error('Missing STRIPE_SECRET_KEY in .env — copy .env.example and add your test key.')
  }

  const stripe = new Stripe(stripeSecretKey)
  const clientUrl = process.env.CLIENT_URL ?? 'http://localhost:5173'

  const app = express()
  app.use(cors({ origin: clientUrl }))

  app.post(
    '/api/webhooks/stripe',
    express.raw({ type: 'application/json' }),
    async (req, res) => {
      const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET

      if (!webhookSecret) {
        res.status(503).send('Webhook secret not configured')
        return
      }

      const signature = req.headers['stripe-signature']

      try {
        const event = stripe.webhooks.constructEvent(req.body, signature, webhookSecret)

        if (event.type === 'checkout.session.completed') {
          const session = event.data.object
          console.log('Payment completed:', session.id)
        }

        res.json({ received: true })
      } catch (err) {
        console.error('Webhook error:', err.message)
        res.status(400).send(`Webhook Error: ${err.message}`)
      }
    },
  )

  app.use(express.json())

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true })
  })

  app.post('/api/create-checkout-session', async (req, res) => {
    try {
      const items = req.body?.items

      if (!Array.isArray(items) || items.length === 0) {
        res.status(400).json({ error: 'Cart is empty' })
        return
      }

      const lineItems = []

      for (const item of items) {
        const product = productById.get(item.id)
        const quantity = Number(item.quantity)

        if (!product || !Number.isInteger(quantity) || quantity < 1 || quantity > 99) {
          res.status(400).json({ error: 'Invalid cart item' })
          return
        }

        lineItems.push({
          quantity,
          price_data: {
            currency: 'usd',
            unit_amount: product.priceInCents,
            product_data: { name: product.name },
          },
        })
      }

      const session = await stripe.checkout.sessions.create({
        mode: 'payment',
        line_items: lineItems,
        success_url: `${clientUrl}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${clientUrl}/checkout/cancel`,
      })

      res.json({ url: session.url })
    } catch (err) {
      console.error('Checkout session error:', err)
      res.status(500).json({ error: 'Could not start checkout' })
    }
  })

  app.get('/api/checkout-session', async (req, res) => {
    try {
      const sessionId = req.query.session_id

      if (typeof sessionId !== 'string') {
        res.status(400).json({ error: 'Missing session_id' })
        return
      }

      const session = await stripe.checkout.sessions.retrieve(sessionId)

      res.json({
        status: session.status,
        paymentStatus: session.payment_status,
        email: session.customer_details?.email ?? null,
        amountTotal: session.amount_total,
      })
    } catch (err) {
      console.error('Session retrieve error:', err)
      res.status(500).json({ error: 'Could not load checkout session' })
    }
  })

  return app
}
