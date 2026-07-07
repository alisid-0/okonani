import { useEffect, useState } from 'react'
import PageHeader from '../components/PageHeader'
import SocialFeedSection from '../components/SocialFeedSection'
import { fetchSocialFeeds, type SocialFeedsResponse } from '../lib/socialApi'

export default function Socials() {
  const [feeds, setFeeds] = useState<SocialFeedsResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function load() {
      setLoading(true)
      setError(null)

      try {
        const data = await fetchSocialFeeds()
        if (!cancelled) setFeeds(data)
      } catch {
        if (!cancelled) setError('Could not load social feeds.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()

    return () => {
      cancelled = true
    }
  }, [])

  return (
    <div className="page page-socials scrapbook-page">
      <PageHeader
        title="Socials"
        subtitle="Recent posts from Instagram and TikTok! Follow me for new charms, drops, and studio updates!"
      />

      {loading && <p className="social-page-status">Loading feeds…</p>}
      {error && <p className="form-error">{error}</p>}

      {feeds && (
        <div className="social-page-layout">
          <SocialFeedSection profile={feeds.instagram} platformLabel="Instagram" />
          <SocialFeedSection profile={feeds.tiktok} platformLabel="TikTok" />
        </div>
      )}
    </div>
  )
}
