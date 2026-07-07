export type SocialPost = {
  id: string
  platform: 'instagram' | 'tiktok'
  permalink: string
  thumbnailUrl: string | null
  mediaUrl: string | null
  mediaType: string
  caption: string
  publishedAt: string | null
  embedHtml?: string | null
}

export type SocialProfile = {
  username: string
  url: string
  posts: SocialPost[]
  sources: string[]
}

export type SocialFeedsResponse = {
  profiles: {
    instagram: { username: string; url: string }
    tiktok: { username: string; url: string }
  }
  instagram: SocialProfile
  tiktok: SocialProfile
  refreshedAt: string | null
  errors?: string[]
  stale?: boolean
}

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL?.replace(/\/$/, '') ?? ''

function apiUrl(path: string): string {
  return `${apiBaseUrl}${path}`
}

export async function fetchSocialFeeds(options: { refresh?: boolean } = {}): Promise<SocialFeedsResponse> {
  const query = options.refresh ? '?refresh=1' : ''
  const response = await fetch(apiUrl(`/api/social/feeds${query}`))

  if (!response.ok) {
    throw new Error('Could not load social feeds.')
  }

  return response.json() as Promise<SocialFeedsResponse>
}
