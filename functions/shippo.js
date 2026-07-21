const { getShippoToken, getShipFromAddress } = require('./env')

const SHIPPO_API = 'https://api.goshippo.com'

function assertShipFromConfigured(address) {
  if (!address.street1 || !address.city || !address.state || !address.zip) {
    const error = new Error(
      'Ship-from address is not configured. Set SHIP_FROM_STREET1, SHIP_FROM_CITY, SHIP_FROM_STATE, and SHIP_FROM_ZIP in .env',
    )
    error.status = 503
    throw error
  }
}

async function shippoFetch(path, { method = 'GET', body } = {}) {
  const token = getShippoToken()
  if (!token) {
    const error = new Error('SHIPPO_API_TOKEN is not configured')
    error.status = 503
    throw error
  }

  const res = await fetch(`${SHIPPO_API}${path}`, {
    method,
    headers: {
      Authorization: `ShippoToken ${token}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  })

  const text = await res.text()
  let data = {}

  if (text.trim()) {
    try {
      data = JSON.parse(text)
    } catch {
      const error = new Error('Shippo returned an invalid response')
      error.status = 502
      throw error
    }
  }

  if (!res.ok) {
    const message =
      typeof data.detail === 'string'
        ? data.detail
        : Array.isArray(data.messages) && data.messages[0]?.text
          ? data.messages[0].text
          : `Shippo request failed (${res.status})`
    const error = new Error(message)
    error.status = res.status >= 400 && res.status < 600 ? res.status : 502
    throw error
  }

  return data
}

function toShippoAddress(address, { isResidential = true } = {}) {
  return {
    name: address.name || 'Customer',
    street1: address.street1 || address.line1 || '',
    street2: address.street2 || address.line2 || '',
    city: address.city || '',
    state: address.state || '',
    zip: address.zip || address.postalCode || '',
    country: address.country || 'US',
    phone: address.phone || '',
    email: address.email || '',
    is_residential: isResidential,
  }
}

function toShippoParcel(dims, weightOz) {
  return {
    length: String(dims.lengthIn),
    width: String(dims.widthIn),
    height: String(dims.heightIn),
    distance_unit: 'in',
    weight: String(Math.max(0.1, weightOz)),
    mass_unit: 'oz',
  }
}

function preferRate(rates, shippingRateName = '') {
  const name = (shippingRateName || '').toLowerCase()
  const wantPriority = name.includes('priority')

  const usps = rates.filter((rate) => (rate.provider || '').toUpperCase() === 'USPS')
  const pool = usps.length > 0 ? usps : rates

  const scored = pool.map((rate) => {
    const service = `${rate.servicelevel?.name || ''} ${rate.servicelevel?.token || ''}`.toLowerCase()
    let score = 0

    if (wantPriority) {
      if (service.includes('priority')) score += 10
      if (service.includes('express')) score += 5
    } else {
      if (service.includes('ground') || service.includes('advantage') || service.includes('first')) score += 10
      if (service.includes('priority')) score -= 2
    }

    const amount = Number.parseFloat(rate.amount || '999')
    return { rate, score, amount }
  })

  scored.sort((a, b) => b.score - a.score || a.amount - b.amount)
  return scored[0]?.rate || null
}

async function createShipmentRates({ toAddress, dims, weightOz, shippingRateName }) {
  assertShipFromConfigured(getShipFromAddress())

  const shipment = await shippoFetch('/shipments/', {
    method: 'POST',
    body: {
      address_from: toShippoAddress(getShipFromAddress(), { isResidential: false }),
      address_to: toShippoAddress(toAddress),
      parcels: [toShippoParcel(dims, weightOz)],
      async: false,
    },
  })

  const rates = Array.isArray(shipment.rates) ? shipment.rates : []
  const recommended = preferRate(rates, shippingRateName)

  return {
    shipmentId: shipment.object_id,
    rates: rates.map((rate) => ({
      objectId: rate.object_id,
      provider: rate.provider,
      service: rate.servicelevel?.name || rate.servicelevel?.token || 'Service',
      amount: rate.amount,
      currency: rate.currency,
      estimatedDays: rate.estimated_days ?? null,
    })),
    recommendedRateId: recommended?.object_id || null,
  }
}

async function purchaseLabel(rateObjectId) {
  if (!rateObjectId) {
    const error = new Error('A shipping rate is required to buy a label')
    error.status = 400
    throw error
  }

  const transaction = await shippoFetch('/transactions/', {
    method: 'POST',
    body: {
      rate: rateObjectId,
      label_file_type: 'PDF',
      async: false,
    },
  })

  if (transaction.status !== 'SUCCESS' && transaction.status !== 'QUEUED') {
    const message =
      Array.isArray(transaction.messages) && transaction.messages[0]?.text
        ? transaction.messages[0].text
        : 'Could not purchase shipping label'
    const error = new Error(message)
    error.status = 502
    throw error
  }

  return {
    transactionId: transaction.object_id,
    status: transaction.status,
    labelUrl: transaction.label_url || null,
    trackingNumber: transaction.tracking_number || null,
    trackingUrl: transaction.tracking_url_provider || null,
    carrier: transaction.rate?.provider || 'USPS',
  }
}

/**
 * Validate a US address via Shippo. Returns cleaned fields when available.
 */
async function validateAddress(address) {
  const payload = {
    ...toShippoAddress(address, { isResidential: true }),
    validate: true,
  }

  const result = await shippoFetch('/addresses/', {
    method: 'POST',
    body: payload,
  })

  const validation = result.validation_results || {}
  const isValid = validation.is_valid === true
  const messages = Array.isArray(validation.messages)
    ? validation.messages
        .map((item) => (typeof item?.text === 'string' ? item.text : typeof item === 'string' ? item : null))
        .filter(Boolean)
    : Array.isArray(result.messages)
      ? result.messages
          .map((item) => (typeof item?.text === 'string' ? item.text : null))
          .filter(Boolean)
      : []

  const cleaned = {
    name: result.name || address.name || '',
    line1: result.street1 || address.street1 || address.line1 || '',
    line2: result.street2 || address.street2 || address.line2 || '',
    city: result.city || address.city || '',
    state: (result.state || address.state || '').toUpperCase(),
    postalCode: result.zip || address.zip || address.postalCode || '',
    country: (result.country || address.country || 'US').toUpperCase(),
    phone: result.phone || address.phone || '',
    email: result.email || address.email || '',
  }

  return {
    isValid,
    messages,
    address: cleaned,
    objectId: result.object_id || null,
  }
}

/**
 * Register tracking so Shippo can send track_updated webhooks for this package.
 */
async function registerTracking({ carrier, trackingNumber, metadata }) {
  if (!trackingNumber) return null

  const carrierToken = String(carrier || 'usps').trim().toLowerCase() || 'usps'

  try {
    return await shippoFetch('/tracks/', {
      method: 'POST',
      body: {
        carrier: carrierToken,
        tracking_number: trackingNumber,
        metadata: metadata || '',
      },
    })
  } catch (err) {
    // Labels purchased through Shippo are often already tracked; don't fail fulfillment.
    console.warn('Shippo track registration failed:', err?.message || err)
    return null
  }
}

function normalizeTrackingStatus(raw) {
  if (!raw) return null
  if (typeof raw === 'string') return raw.toUpperCase()
  if (typeof raw === 'object') {
    if (typeof raw.status === 'string') return raw.status.toUpperCase()
    if (typeof raw.status_details === 'string') return raw.status_details
  }
  return null
}

module.exports = {
  getShippoToken,
  getShipFromAddress,
  createShipmentRates,
  purchaseLabel,
  preferRate,
  validateAddress,
  registerTracking,
  normalizeTrackingStatus,
}
