import { auth } from './firebase'

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL?.replace(/\/$/, '') ?? ''

function apiUrl(path: string): string {
  return `${apiBaseUrl}${path}`
}

async function authedFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const user = auth.currentUser
  if (!user) {
    throw new Error('Sign in required')
  }

  const token = await user.getIdToken()
  const res = await fetch(apiUrl(path), {
    ...init,
    headers: {
      'X-Firebase-Auth': token,
      'Content-Type': 'application/json',
      ...init?.headers,
    },
  })

  const text = await res.text()
  let data: Record<string, unknown> = {}

  if (text.trim()) {
    try {
      data = JSON.parse(text) as Record<string, unknown>
    } catch {
      throw new Error('Rewards service returned an invalid response')
    }
  }

  if (!res.ok) {
    throw new Error(typeof data.error === 'string' ? data.error : 'Request failed')
  }

  return data as T
}

export type ActiveReward = {
  id: string
  code: string
  discountCents: number
  pointsSpent: number
}

export type RewardsSummary = {
  points: number
  pointsPerDollar: number
  redeemPointsCost: number
  redeemDiscountCents: number
  activeRewards: ActiveReward[]
}

export type RedeemPointsResult = {
  rewardId: string
  code: string
  promotionCodeId: string
  discountCents: number
  pointsSpent: number
  pointsRemaining: number
}

export async function getRewardsSummary(): Promise<RewardsSummary> {
  return authedFetch<RewardsSummary>('/api/rewards/summary')
}

export async function redeemPoints(): Promise<RedeemPointsResult> {
  return authedFetch<RedeemPointsResult>('/api/rewards/redeem', { method: 'POST' })
}

export async function getOptionalAuthToken(): Promise<string | null> {
  const user = auth.currentUser
  if (!user) return null
  return user.getIdToken()
}
