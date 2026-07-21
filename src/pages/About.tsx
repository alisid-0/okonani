import aboutArt from '../assets/hero/Untitled_Artwork(2).webp'
import PageHeader from '../components/PageHeader'

export default function About() {
  return (
    <div className="page page-about notebook-page">
      <PageHeader title="About" subtitle="A little about me and the charms I make." />

      <div className="about-layout">
        <figure className="about-sticker">
          <img
            src={aboutArt}
            alt="okonani mascot"
            className="about-illustration"
            width={720}
            height={720}
            loading="lazy"
            decoding="async"
          />
        </figure>

        <div className="about-copy">
          <div className="about-card content-block">
            <p>
              Hi!! I'm the person behind okonani! I make every charm and every sticker by hand.
              Not long ago, I was just hopping from one convention to another, and one day I sat down and faced my fears
              and made my first charm. I've been making charms and stickers ever since, and I'm so grateful for the support
              I've received from you all!
            </p>
            <p>
              I'm still new to this and I'm still learning, but I can't wait to see where this journey takes me!
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
