import logoMark from '../assets/hero/Untitled_Artwork(3).png'
import { DEFAULT_OFFLINE_MESSAGE } from '../data/siteSettings'

type SiteOfflineProps = {
  message?: string
}

export default function SiteOffline({
  message = DEFAULT_OFFLINE_MESSAGE,
}: SiteOfflineProps) {
  return (
    <div className="site-offline">
      <div className="site-offline-inner">
        <img
          src={logoMark}
          alt=""
          className="site-offline-logo"
          width={220}
          height={88}
          decoding="async"
        />
        <p className="site-offline-brand">okonani</p>
        <p className="site-offline-message">{message}</p>
      </div>
    </div>
  )
}
