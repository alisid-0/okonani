import PageHeader from '../components/PageHeader'

export default function About() {
  return (
    <div className="page">
      <PageHeader title="About" subtitle="Learn more about okonani." />

      <div className="content-block">
        <p>
          okonani is an online store skeleton built with Vite and React. This page is a placeholder
          for your brand story, mission, and team information.
        </p>
        <p>
          Replace this copy with details about your products, values, and what makes your shop
          unique.
        </p>
      </div>
    </div>
  )
}
