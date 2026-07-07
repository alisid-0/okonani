import type { SocialPost, SocialProfile } from '../lib/socialApi'

type SocialFeedSectionProps = {
  profile: SocialProfile
  platformLabel: string
}

function formatDate(value: string | null) {
  if (!value) return null

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null

  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

function SocialPostCard({ post }: { post: SocialPost }) {
  const dateLabel = formatDate(post.publishedAt)

  return (
    <a
      href={post.permalink}
      target="_blank"
      rel="noopener noreferrer"
      className="social-post-card"
    >
      <div className="social-post-media">
        {post.thumbnailUrl ?
          <img src={post.thumbnailUrl} alt="" className="social-post-image" loading="lazy" />
        : <div className="social-post-image social-post-image-placeholder" aria-hidden="true" />}
      </div>
      <div className="social-post-body">
        {post.caption && <p className="social-post-caption">{post.caption}</p>}
        {dateLabel && <p className="social-post-date">{dateLabel}</p>}
      </div>
    </a>
  )
}

export default function SocialFeedSection({ profile, platformLabel }: SocialFeedSectionProps) {
  return (
    <section className="social-feed-section" aria-labelledby={`${profile.username}-feed-title`}>
      <div className="social-feed-header">
        <div>
          <h2 id={`${profile.username}-feed-title`} className="social-feed-title">
            {platformLabel}
          </h2>
          <p className="social-feed-handle">@{profile.username}</p>
        </div>
        <a
          href={profile.url}
          target="_blank"
          rel="noopener noreferrer"
          className="btn btn-ghost btn-sm social-feed-follow"
        >
          Follow
        </a>
      </div>

      {profile.posts.length > 0 ?
        <div className="social-post-grid">
          {profile.posts.map((post) => (
            <SocialPostCard key={`${post.platform}-${post.id}`} post={post} />
          ))}
        </div>
      : <p className="social-feed-empty">
          Recent posts are not available right now.{' '}
          <a href={profile.url} target="_blank" rel="noopener noreferrer">
            Visit @{profile.username}
          </a>
        </p>
      }
    </section>
  )
}
