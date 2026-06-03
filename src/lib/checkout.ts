type CheckoutItem = {
  id: number
  quantity: number
}

async function parseJsonResponse(res: Response): Promise<Record<string, unknown>> {
  const text = await res.text()

  if (!text.trim()) {
    throw new Error(
      'Payment API returned no data. Restart with npm run dev and ensure STRIPE_SECRET_KEY is set in .env.',
    )
  }

  try {
    return JSON.parse(text) as Record<string, unknown>
  } catch {
    throw new Error('Payment API returned an invalid response.')
  }
}

export async function createCheckoutSession(items: CheckoutItem[]): Promise<string> {
  const res = await fetch('/api/create-checkout-session', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ items }),
  })

  const data = await parseJsonResponse(res)

  if (!res.ok) {
    throw new Error(typeof data.error === 'string' ? data.error : 'Checkout failed')
  }

  if (typeof data.url !== 'string') {
    throw new Error('No checkout URL returned')
  }

  return data.url
}

export type CheckoutSessionDetails = {
  status: string | null
  paymentStatus: string
  email: string | null
  amountTotal: number | null
}

export async function getCheckoutSession(sessionId: string): Promise<CheckoutSessionDetails> {
  const res = await fetch(`/api/checkout-session?session_id=${encodeURIComponent(sessionId)}`)
  const data = await parseJsonResponse(res)

  if (!res.ok) {
    throw new Error(typeof data.error === 'string' ? data.error : 'Could not load order')
  }

  return data as unknown as CheckoutSessionDetails
}
