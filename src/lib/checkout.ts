type CheckoutItem = {
  stripePriceId: string
  quantity: number
}

type CheckoutOptions = {
  rewardId?: string
  promotionCode?: string
  authToken?: string | null
}

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL?.replace(/\/$/, '') ?? ''

function apiUrl(path: string): string {
  return `${apiBaseUrl}${path}`
}

async function parseJsonResponse(res: Response): Promise<Record<string, unknown>> {
  const text = await res.text()

  if (!text.trim()) {
    throw new Error(
      'Payment API returned no data. Start the Firebase emulators and check VITE_API_BASE_URL.',
    )
  }

  try {
    return JSON.parse(text) as Record<string, unknown>
  } catch {
    throw new Error('Payment API returned an invalid response.')
  }
}

export async function createCheckoutSession(
  items: CheckoutItem[],
  options: CheckoutOptions = {},
): Promise<string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }

  if (options.authToken) {
    headers['X-Firebase-Auth'] = options.authToken
  }

  const body: Record<string, unknown> = { items }

  if (options.rewardId) {
    body.rewardId = options.rewardId
  }

  if (options.promotionCode?.trim()) {
    body.promotionCode = options.promotionCode.trim()
  }

  const res = await fetch(apiUrl('/api/create-checkout-session'), {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
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
  pointsEarned: number
  earnedPoints: boolean
}

export async function getCheckoutSession(sessionId: string): Promise<CheckoutSessionDetails> {
  const res = await fetch(apiUrl(`/api/checkout-session?session_id=${encodeURIComponent(sessionId)}`))
  const data = await parseJsonResponse(res)

  if (!res.ok) {
    throw new Error(typeof data.error === 'string' ? data.error : 'Could not load order')
  }

  return data as unknown as CheckoutSessionDetails
}
