import PageHeader from '../components/PageHeader'

export default function Contact() {
  return (
    <div className="page">
      <PageHeader title="Contact" subtitle="Get in touch with us." />

      <form className="contact-form" onSubmit={(e) => e.preventDefault()}>
        <label>
          Name
          <input type="text" name="name" placeholder="Your name" />
        </label>
        <label>
          Email
          <input type="email" name="email" placeholder="you@example.com" />
        </label>
        <label>
          Message
          <textarea name="message" rows={5} placeholder="How can we help?" />
        </label>
        <button type="submit" className="btn btn-primary">
          Send message
        </button>
      </form>
    </div>
  )
}
