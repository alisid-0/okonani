const { getFirestore } = require('firebase-admin/firestore')

const CACHE_DOC = 'socialFeeds/public'
const CACHE_TTL_MS = 60 * 60 * 1000

const PROFILES = {
  instagram: {
    username: 'okonaniii',
    url: 'https://www.instagram.com/okonaniii/',
  },
  tiktok: {
    username: 'okonani',
    url: 'https://www.tiktok.com/@okonani',
  },
}

function getConfig(key) {
  return process.env[key] ?? ''
}

function clipCaption(text, max = 120) {
  const normalized = String(text ?? '').replace(/\s+/g, ' ').trim()
  if (normalized.length <= max) return normalized
  return `${normalized.slice(0, max - 1)}…`
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, options)
  if (!response.ok) {
    const body = await response.text().catch(() => '')
    throw new Error(`Request failed (${response.status}): ${body.slice(0, 200)}`)
  }
  return response.json()
}

async function fetchInstagramGraph() {
  const token = getConfig('INSTAGRAM_ACCESS_TOKEN')
  const userId = getConfig('INSTAGRAM_USER_ID')
  if (!token || !userId) return null

  const fields = [
    'id',
    'caption',
    'media_type',
    'media_url',
    'permalink',
    'thumbnail_url',
    'timestamp',
  ].join(',')

  const data = await fetchJson(
    `https://graph.instagram.com/${userId}/media?fields=${fields}&limit=12&access_token=${encodeURIComponent(token)}`,
  )

  return (data.data ?? []).map((item) => ({
    id: item.id,
    platform: 'instagram',
    permalink: item.permalink,
    thumbnailUrl: item.thumbnail_url || item.media_url,
    mediaUrl: item.media_url,
    mediaType: item.media_type,
    caption: clipCaption(item.caption),
    publishedAt: item.timestamp ?? null,
  }))
}

async function fetchTikTokApi() {
  const token = getConfig('TIKTOK_ACCESS_TOKEN')
  if (!token) return null

  const response = await fetch('https://open.tiktokapis.com/v2/video/list/?fields=id,title,cover_image_url,share_url,create_time', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ max_count: 12 }),
  })

  if (!response.ok) {
    const body = await response.text().catch(() => '')
    throw new Error(`TikTok API failed (${response.status}): ${body.slice(0, 200)}`)
  }

  const data = await response.json()
  const videos = data?.data?.videos ?? []

  return videos.map((video) => ({
    id: video.id,
    platform: 'tiktok',
    permalink: video.share_url,
    thumbnailUrl: video.cover_image_url,
    mediaUrl: null,
    mediaType: 'video',
    caption: clipCaption(video.title),
    publishedAt: video.create_time ? new Date(video.create_time * 1000).toISOString() : null,
  }))
}

function extractTikTokVideosFromUniversalData(data) {
  const scope = data?.__DEFAULT_SCOPE__ ?? {}
  const detailKey = Object.keys(scope).find((key) => key.startsWith('webapp.user-detail'))
  const detail = detailKey ? scope[detailKey] : null
  const itemList = detail?.itemList ?? detail?.userInfo?.itemList ?? []

  if (Array.isArray(itemList) && itemList.length > 0) {
    return itemList
  }

  const videoModule = scope['webapp.video-detail']?.itemInfo?.itemStruct
  if (videoModule) return [videoModule]

  return []
}

async function scrapeTikTokFeed(username) {
  const response = await fetch(`https://www.tiktok.com/@${encodeURIComponent(username)}`, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
      'Accept-Language': 'en-US,en;q=0.9',
    },
  })

  if (!response.ok) {
    throw new Error(`TikTok profile unavailable (${response.status})`)
  }

  const html = await response.text()
  const match = html.match(
    /<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__"[^>]*>([^<]+)<\/script>/,
  )

  if (!match) {
    throw new Error('Could not parse TikTok profile page')
  }

  const parsed = JSON.parse(match[1])
  const items = extractTikTokVideosFromUniversalData(parsed)

  return items.slice(0, 12).map((item) => {
    const video = item?.item ?? item
    const id = video?.id
    const author = video?.author?.uniqueId ?? username

    return {
      id: String(id),
      platform: 'tiktok',
      permalink: `https://www.tiktok.com/@${author}/video/${id}`,
      thumbnailUrl: video?.video?.cover ?? video?.video?.dynamicCover ?? null,
      mediaUrl: null,
      mediaType: 'video',
      caption: clipCaption(video?.desc),
      publishedAt: video?.createTime ? new Date(video.createTime * 1000).toISOString() : null,
    }
  })
}

async function fetchTikTokOembed(url) {
  const data = await fetchJson(`https://www.tiktok.com/oembed?url=${encodeURIComponent(url)}`)
  return {
    id: url,
    platform: 'tiktok',
    permalink: data.author_url ? `${data.author_url}/video/${data.embed_product_id ?? ''}` : url,
    thumbnailUrl: data.thumbnail_url ?? null,
    mediaUrl: null,
    mediaType: 'video',
    caption: clipCaption(data.title),
    publishedAt: null,
    embedHtml: data.html ?? null,
  }
}

async function fetchInstagramOembed(url) {
  const appId = getConfig('META_APP_ID')
  const appSecret = getConfig('META_APP_SECRET')
  const token = getConfig('INSTAGRAM_ACCESS_TOKEN')
  const accessToken =
    appId && appSecret ? `${appId}|${appSecret}` : token

  if (!accessToken) return null

  const data = await fetchJson(
    `https://graph.facebook.com/v21.0/instagram_oembed?url=${encodeURIComponent(url)}&access_token=${encodeURIComponent(accessToken)}&omitscript=true`,
  )

  return {
    id: url,
    platform: 'instagram',
    permalink: url,
    thumbnailUrl: data.thumbnail_url ?? null,
    mediaUrl: null,
    mediaType: 'rich',
    caption: clipCaption(data.title),
    publishedAt: null,
    embedHtml: data.html ?? null,
  }
}

async function fetchConfiguredUrlFeeds() {
  const instagramUrls = getConfig('INSTAGRAM_POST_URLS')
    .split(',')
    .map((url) => url.trim())
    .filter(Boolean)
  const tiktokUrls = getConfig('TIKTOK_VIDEO_URLS')
    .split(',')
    .map((url) => url.trim())
    .filter(Boolean)

  const instagramPosts = (
    await Promise.all(
      instagramUrls.map(async (url) => {
        try {
          return await fetchInstagramOembed(url)
        } catch (err) {
          console.warn('Instagram oEmbed failed:', url, err.message)
          return null
        }
      }),
    )
  ).filter(Boolean)

  const tiktokPosts = (
    await Promise.all(
      tiktokUrls.map(async (url) => {
        try {
          return await fetchTikTokOembed(url)
        } catch (err) {
          console.warn('TikTok oEmbed failed:', url, err.message)
          return null
        }
      }),
    )
  ).filter(Boolean)

  return { instagramPosts, tiktokPosts }
}

async function refreshSocialFeeds() {
  const errors = []
  let instagramPosts = []
  let tiktokPosts = []
  const sources = { instagram: [], tiktok: [] }

  try {
    const graphPosts = await fetchInstagramGraph()
    if (graphPosts) {
      instagramPosts = graphPosts
      sources.instagram.push('graph_api')
    }
  } catch (err) {
    errors.push(`Instagram API: ${err.message}`)
    console.warn('Instagram Graph fetch failed:', err)
  }

  try {
    const apiPosts = await fetchTikTokApi()
    if (apiPosts) {
      tiktokPosts = apiPosts
      sources.tiktok.push('display_api')
    }
  } catch (err) {
    errors.push(`TikTok API: ${err.message}`)
    console.warn('TikTok API fetch failed:', err)
  }

  if (tiktokPosts.length === 0) {
    try {
      tiktokPosts = await scrapeTikTokFeed(PROFILES.tiktok.username)
      if (tiktokPosts.length > 0) sources.tiktok.push('profile_scrape')
    } catch (err) {
      errors.push(`TikTok scrape: ${err.message}`)
      console.warn('TikTok scrape failed:', err)
    }
  }

  const configured = await fetchConfiguredUrlFeeds()
  if (instagramPosts.length === 0 && configured.instagramPosts.length > 0) {
    instagramPosts = configured.instagramPosts
    sources.instagram.push('oembed_urls')
  }
  if (tiktokPosts.length === 0 && configured.tiktokPosts.length > 0) {
    tiktokPosts = configured.tiktokPosts
    sources.tiktok.push('oembed_urls')
  }

  const payload = {
    profiles: PROFILES,
    instagram: {
      ...PROFILES.instagram,
      posts: instagramPosts,
      sources: sources.instagram,
    },
    tiktok: {
      ...PROFILES.tiktok,
      posts: tiktokPosts,
      sources: sources.tiktok,
    },
    refreshedAt: new Date().toISOString(),
    errors,
  }

  await getFirestore().doc(CACHE_DOC).set(payload, { merge: false })
  return payload
}

async function readCachedFeeds() {
  const snap = await getFirestore().doc(CACHE_DOC).get()
  if (!snap.exists) return null
  return snap.data()
}

function isCacheStale(cached) {
  if (!cached?.refreshedAt) return true
  const age = Date.now() - new Date(cached.refreshedAt).getTime()
  return age > CACHE_TTL_MS
}

async function getSocialFeeds({ force = false } = {}) {
  const cached = await readCachedFeeds()

  if (!force && cached && !isCacheStale(cached)) {
    return cached
  }

  try {
    return await refreshSocialFeeds()
  } catch (err) {
    console.error('Social feed refresh failed:', err)
    if (cached) {
      return {
        ...cached,
        errors: [...(cached.errors ?? []), err.message],
        stale: true,
      }
    }

    return {
      profiles: PROFILES,
      instagram: { ...PROFILES.instagram, posts: [], sources: [] },
      tiktok: { ...PROFILES.tiktok, posts: [], sources: [] },
      refreshedAt: null,
      errors: [err.message],
      stale: true,
    }
  }
}

module.exports = {
  CACHE_DOC,
  PROFILES,
  getSocialFeeds,
  refreshSocialFeeds,
  readCachedFeeds,
  isCacheStale,
}
