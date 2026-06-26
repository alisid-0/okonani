import aboutArt from '../assets/hero/Untitled_Artwork(2).webp'
import PageHeader from '../components/PageHeader'
import PageSheet from '../components/PageSheet'

export default function About() {
  return (
    <div className="page page-about">
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

        <PageSheet className="about-copy">
          <div className="content-block">
            <p>
              Hi! I&apos;m the person behind okonani, and I make every charm you see here by hand.
              What started as something small for myself grew into a little shop where I get to share
              pieces I&apos;m genuinely excited about.
            </p>
            <p>
              I&apos;m Palestinian, and that part of who I am shows up in how I work: patient, careful,
              and proud of the details. I want each charm to feel personal, like something you picked
              out because it actually means something to you.
            </p>
            <p>
              Thank you for being here. Every order supports an independent maker, and I&apos;m so
              grateful you stopped by.
            </p>
          </div>
        </PageSheet>
      </div>
    </div>
  )
}
