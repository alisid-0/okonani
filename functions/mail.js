const { getConfig, getClientUrl, getAdminEmails } = require('./env')

/**
 * Optional email via Resend (https://resend.com).
 * Set RESEND_API_KEY + MAIL_FROM in .env / secrets.
 */
async function sendEmail({ to, subject, html, text }) {
  const apiKey = getConfig('RESEND_API_KEY').trim()
  const from = getConfig('MAIL_FROM').trim() || getConfig('SHIP_FROM_EMAIL').trim()
  const recipients = Array.isArray(to) ? to.filter(Boolean) : [to].filter(Boolean)

  if (!apiKey || !from || recipients.length === 0) {
    return { sent: false, reason: !apiKey ? 'RESEND_API_KEY not configured' : 'missing from/to' }
  }

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from,
      to: recipients,
      subject,
      html,
      text,
    }),
  })

  if (!res.ok) {
    const body = await res.text()
    console.error('Resend email failed:', res.status, body)
    return { sent: false, reason: `Resend error ${res.status}` }
  }

  return { sent: true }
}

function formatCents(cents) {
  const value = typeof cents === 'number' ? cents : 0
  return `$${(value / 100).toFixed(2)}`
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function formatAddressBlock(address) {
  if (!address?.line1) return 'No shipping address'
  return [
    address.name,
    address.line1,
    address.line2,
    [address.city, address.state, address.postalCode].filter(Boolean).join(', '),
    address.country,
  ]
    .filter(Boolean)
    .join('\n')
}

function getOrderNotifyEmails() {
  const configured = getConfig('ORDER_NOTIFY_EMAIL')
    .split(',')
    .map((email) => email.trim())
    .filter(Boolean)
  if (configured.length > 0) return configured
  return getAdminEmails()
}

async function sendNewOrderAdminEmail(order) {
  const to = getOrderNotifyEmails()
  if (to.length === 0) {
    return { sent: false, reason: 'ORDER_NOTIFY_EMAIL / ADMIN_EMAILS not configured' }
  }

  const orderId = order.id || order.stripeSessionId || ''
  const clientUrl = getClientUrl('https://okonani-dff36.web.app').replace(/\/$/, '')
  const adminUrl = `${clientUrl}/admin?panel=orders&order=${encodeURIComponent(orderId)}`

  const items = Array.isArray(order.items) ? order.items : []
  const itemsHtml = items
    .map((item) => {
      const qty = item.quantity || 1
      const name = escapeHtml(item.name || 'Item')
      const lineTotal =
        typeof item.amountCents === 'number'
          ? item.amountCents
          : (item.unitAmountCents || 0) * qty
      return `<li>${qty} × ${name} — ${formatCents(lineTotal)}</li>`
    })
    .join('')

  const itemsText = items
    .map((item) => {
      const qty = item.quantity || 1
      const lineTotal =
        typeof item.amountCents === 'number'
          ? item.amountCents
          : (item.unitAmountCents || 0) * qty
      return `- ${qty} × ${item.name || 'Item'} — ${formatCents(lineTotal)}`
    })
    .join('\n')

  const addressText = formatAddressBlock(order.shippingAddress)
  const addressHtml = escapeHtml(addressText).replace(/\n/g, '<br>')

  const subject = `New okonani order — ${formatCents(order.amountTotal)}`
  const html = `
    <h2>New order</h2>
    <p><a href="${adminUrl}"><strong>Open order in admin</strong></a></p>
    <p>Order ID: <code>${escapeHtml(orderId)}</code></p>
    <p>Customer: <strong>${escapeHtml(order.customerName || '—')}</strong><br>
       Email: ${escapeHtml(order.email || '—')}<br>
       Phone: ${escapeHtml(order.phone || '—')}</p>
    <h3>Ship to</h3>
    <p>${addressHtml}</p>
    <h3>Items</h3>
    <ul>${itemsHtml || '<li>No items</li>'}</ul>
    <p>Total paid: <strong>${formatCents(order.amountTotal)}</strong></p>
    <p>Shipping: ${escapeHtml(order.shippingRateName || '—')}
       (${formatCents(order.shippingAmountCents)})</p>
    <p>Package: ${escapeHtml(order.packageType || '—')} · ${escapeHtml(order.postageMode || '—')}</p>
    <p>Payment: ${escapeHtml(order.paymentStatus || '—')}</p>
  `

  const text = [
    'New okonani order',
    '',
    `Open in admin: ${adminUrl}`,
    `Order ID: ${orderId}`,
    `Customer: ${order.customerName || '—'}`,
    `Email: ${order.email || '—'}`,
    `Phone: ${order.phone || '—'}`,
    '',
    'Ship to:',
    addressText,
    '',
    'Items:',
    itemsText || '(none)',
    '',
    `Total paid: ${formatCents(order.amountTotal)}`,
    `Shipping: ${order.shippingRateName || '—'} (${formatCents(order.shippingAmountCents)})`,
    `Package: ${order.packageType || '—'} · ${order.postageMode || '—'}`,
    `Payment: ${order.paymentStatus || '—'}`,
  ].join('\n')

  return sendEmail({ to, subject, html, text })
}

async function sendShippingConfirmationEmail({
  to,
  customerName,
  orderId,
  carrier,
  trackingNumber,
  trackingUrl,
}) {
  if (!to) return { sent: false, reason: 'no customer email' }

  const name = customerName || 'there'
  const trackLine = trackingUrl
    ? `<p><a href="${trackingUrl}">Track your package</a></p>`
    : trackingNumber
      ? `<p>Tracking number: <strong>${trackingNumber}</strong></p>`
      : ''

  const subject = 'Your okonani order has shipped'
  const html = `
    <p>Hi ${escapeHtml(name)},</p>
    <p>Good news — your okonani order is on its way.</p>
    <p>Order: <code>${escapeHtml(orderId)}</code></p>
    ${carrier ? `<p>Carrier: ${escapeHtml(carrier)}</p>` : ''}
    ${trackLine}
    <p>Thank you for supporting handmade work.</p>
    <p>— okonani</p>
  `
  const text = [
    `Hi ${name},`,
    '',
    'Your okonani order has shipped.',
    `Order: ${orderId}`,
    carrier ? `Carrier: ${carrier}` : '',
    trackingNumber ? `Tracking: ${trackingNumber}` : '',
    trackingUrl || '',
    '',
    '— okonani',
  ]
    .filter(Boolean)
    .join('\n')

  return sendEmail({ to, subject, html, text })
}

async function sendDeliveredEmail({ to, customerName, orderId, trackingUrl }) {
  if (!to) return { sent: false, reason: 'no customer email' }

  const name = customerName || 'there'
  const subject = 'Your okonani order was delivered'
  const html = `
    <p>Hi ${escapeHtml(name)},</p>
    <p>Your okonani order <code>${escapeHtml(orderId)}</code> was marked delivered.</p>
    ${trackingUrl ? `<p><a href="${trackingUrl}">View tracking</a></p>` : ''}
    <p>We hope you love it.</p>
    <p>— okonani</p>
  `

  return sendEmail({
    to,
    subject,
    html,
    text: `Hi ${name},\n\nYour okonani order ${orderId} was delivered.\n${trackingUrl || ''}\n\n— okonani`,
  })
}

module.exports = {
  sendEmail,
  sendNewOrderAdminEmail,
  sendShippingConfirmationEmail,
  sendDeliveredEmail,
}
