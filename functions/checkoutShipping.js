const { quoteShipping, decidePackaging, DEFAULT_LETTER_SETTINGS, bubbleMailerWeightOz, totalItemsWeightOz } = require('./shippingQuote')
const { createShipmentRates, validateAddress } = require('./shippo')
const { PACKAGE_DIMS } = require('./packaging')

function parseDestinationAddress(raw) {
  if (!raw || typeof raw !== 'object') return null

  const nested = raw.address && typeof raw.address === 'object' ? raw.address : raw

  const address = {
    name: String(raw.name || nested.name || '').trim(),
    line1: String(nested.line1 || nested.street1 || '').trim(),
    line2: String(nested.line2 || nested.street2 || '').trim(),
    city: String(nested.city || '').trim(),
    state: String(nested.state || '')
      .trim()
      .toUpperCase(),
    postalCode: String(nested.postalCode || nested.postal_code || nested.zip || '')
      .trim()
      .replace(/\s+/g, ''),
    country: String(nested.country || 'US')
      .trim()
      .toUpperCase() || 'US',
    phone: String(raw.phone || nested.phone || '').trim(),
    email: String(raw.email || nested.email || '').trim(),
  }

  if (!address.line1 || !address.city || !address.state || !address.postalCode) {
    return null
  }

  if (!/^[A-Z]{2}$/.test(address.state)) {
    return null
  }

  return address
}

function amountToCents(amount) {
  const parsed = Number.parseFloat(String(amount))
  if (!Number.isFinite(parsed)) return null
  return Math.max(0, Math.round(parsed * 100))
}

function letterSettingsFromCatalog(shippingTypes = [], letterSettings) {
  if (letterSettings && typeof letterSettings.letterFlatFeeCents === 'number') {
    return {
      letterFlatFeeCents: Math.max(0, Math.round(letterSettings.letterFlatFeeCents)),
      letterMaxItems:
        typeof letterSettings.letterMaxItems === 'number' && letterSettings.letterMaxItems > 0
          ? Math.round(letterSettings.letterMaxItems)
          : DEFAULT_LETTER_SETTINGS.letterMaxItems,
    }
  }

  const letterType =
    shippingTypes.find((type) => type.active && type.packageType === 'envelope') ||
    shippingTypes.find((type) => type.id === 'letter' || type.shipClass === 'letter') ||
    null

  return {
    letterFlatFeeCents:
      letterType && typeof letterType.baseRateCents === 'number'
        ? letterType.baseRateCents
        : DEFAULT_LETTER_SETTINGS.letterFlatFeeCents,
    letterMaxItems:
      letterType && letterType.maxItems > 0
        ? letterType.maxItems
        : DEFAULT_LETTER_SETTINGS.letterMaxItems,
  }
}

/**
 * Stripe/cart shipping choices:
 * - If ≤10 letter-eligible items: Untracked letter (admin flat fee) + Bubble mailer (Shippo)
 * - Otherwise: Bubble mailer only (Shippo)
 */
async function buildCheckoutShippingQuote({
  quoteLines,
  productTypes,
  shippingTypes,
  letterSettings,
  destination,
  skipAddressValidation = false,
}) {
  let addressValidation = null
  let shippingDestination = destination

  if (!skipAddressValidation) {
    try {
      addressValidation = await validateAddress(destination)
      if (addressValidation.isValid && addressValidation.address?.line1) {
        shippingDestination = {
          ...destination,
          ...addressValidation.address,
          name: destination.name || addressValidation.address.name,
          phone: destination.phone || addressValidation.address.phone,
          email: destination.email || addressValidation.address.email,
        }
      } else if (addressValidation && addressValidation.isValid === false) {
        const detail =
          addressValidation.messages?.[0] ||
          'We could not verify that shipping address. Please check street, city, state, and ZIP.'
        const error = new Error(detail)
        error.status = 400
        error.code = 'address_invalid'
        error.addressValidation = addressValidation
        throw error
      }
    } catch (err) {
      if (err.code === 'address_invalid') throw err
      console.warn('Address validation skipped:', err?.message || err)
      addressValidation = {
        isValid: null,
        messages: ['Address validation unavailable — using the address you entered.'],
        address: destination,
      }
    }
  }

  const settings = letterSettingsFromCatalog(shippingTypes, letterSettings)
  const letterType =
    shippingTypes.find((type) => type.id === 'letter') ||
    shippingTypes.find((type) => type.packageType === 'envelope' || type.shipClass === 'letter') ||
    null
  const letterEnabled = !letterType || letterType.active !== false

  const letterEligiblePackaging = decidePackaging(
    quoteLines,
    productTypes,
    settings.letterMaxItems,
  )
  const letterAvailable =
    letterEnabled &&
    letterEligiblePackaging.packageType === 'envelope' &&
    letterEligiblePackaging.postageMode === 'stamp'

  const localQuote = quoteShipping({
    lines: quoteLines,
    productTypes,
    letterSettings: settings,
  })

  // Always quote bubble mailer via Shippo using summed item weights (+ mailer tare).
  const itemsWeightOz =
    typeof letterEligiblePackaging.itemsWeightOz === 'number'
      ? letterEligiblePackaging.itemsWeightOz
      : totalItemsWeightOz(quoteLines)

  const mailerPackaging = {
    packageType: 'bubble_mailer',
    postageMode: 'label',
    reason: letterAvailable
      ? 'Optional tracked bubble mailer (Shippo).'
      : localQuote.reason,
    dims: PACKAGE_DIMS.bubble_mailer,
    weightOz: bubbleMailerWeightOz(itemsWeightOz),
    itemsWeightOz,
    shipClasses: letterEligiblePackaging.shipClasses || [],
  }

  const shippo = await createShipmentRates({
    toAddress: {
      name: shippingDestination.name || 'Customer',
      line1: shippingDestination.line1,
      line2: shippingDestination.line2,
      city: shippingDestination.city,
      state: shippingDestination.state,
      postalCode: shippingDestination.postalCode,
      country: shippingDestination.country || 'US',
      phone: shippingDestination.phone || '',
      email: shippingDestination.email || '',
    },
    dims: mailerPackaging.dims,
    weightOz: mailerPackaging.weightOz,
    shippingRateName: '',
  })

  const shippoRates = (shippo.rates || [])
    .map((rate) => {
      const amountCents = amountToCents(rate.amount)
      if (amountCents == null) return null
      return {
        id: rate.objectId,
        provider: rate.provider,
        service: rate.service,
        amountCents,
        currency: (rate.currency || 'usd').toLowerCase(),
        estimatedDays: rate.estimatedDays,
        source: 'shippo',
      }
    })
    .filter(Boolean)
    .sort((a, b) => a.amountCents - b.amountCents)

  const bestShippo =
    (shippo.recommendedRateId &&
      shippoRates.find((rate) => rate.id === shippo.recommendedRateId)) ||
    shippoRates[0] ||
    null

  const rates = []

  if (letterAvailable) {
    rates.push({
      id: 'untracked-letter',
      provider: 'USPS',
      service: 'Untracked letter',
      amountCents: settings.letterFlatFeeCents,
      currency: 'usd',
      estimatedDays: 5,
      source: 'stamp',
    })
  }

  if (bestShippo) {
    rates.push({
      id: bestShippo.id,
      provider: bestShippo.provider,
      service: 'Bubble mailer',
      amountCents: bestShippo.amountCents,
      currency: bestShippo.currency,
      estimatedDays: bestShippo.estimatedDays,
      source: 'shippo',
    })
  } else if (!letterAvailable) {
    const error = new Error(
      'Could not get Bubble mailer rates from Shippo. Try again in a moment.',
    )
    error.status = 502
    error.code = 'shippo_rates_unavailable'
    throw error
  }

  const recommendedRateId = letterAvailable ? 'untracked-letter' : rates[0]?.id || null

  return {
    mode: letterAvailable ? 'letter_or_mailer' : 'shippo',
    packaging: letterAvailable ? letterEligiblePackaging : mailerPackaging,
    mailerPackaging,
    localQuote,
    rates,
    recommendedRateId,
    shipmentId: shippo.shipmentId || null,
    message: letterAvailable
      ? 'Choose Untracked letter or Bubble mailer.'
      : localQuote.reason,
    addressValidation,
    validatedAddress: shippingDestination,
    letterAvailable,
  }
}

/** Placeholder until the customer enters an address and we load Shippo rates. */
function dummyStripeShippingOption() {
  return {
    shipping_rate_data: {
      type: 'fixed_amount',
      fixed_amount: {
        amount: 0,
        currency: 'usd',
      },
      display_name: 'Calculating shipping…',
      tax_behavior: 'exclusive',
    },
  }
}

function ratesToStripeShippingOptions(rates = []) {
  return rates
    .filter((rate) => rate && typeof rate.amountCents === 'number' && rate.service)
    .map((rate) => ({
      shipping_rate_data: {
        type: 'fixed_amount',
        fixed_amount: {
          amount: Math.max(0, Math.round(rate.amountCents)),
          currency: (rate.currency || 'usd').toLowerCase(),
        },
        display_name: rate.service,
        tax_behavior: 'exclusive',
        delivery_estimate: {
          minimum: { unit: 'business_day', value: rate.estimatedDays || 2 },
          maximum: { unit: 'business_day', value: rate.estimatedDays || 10 },
        },
        metadata: {
          rateId: String(rate.id || ''),
          source: String(rate.source || ''),
          provider: String(rate.provider || ''),
        },
      },
    }))
}

/**
 * Normalize Stripe Checkout shipping_details for session.update.
 */
function toStripeCollectedShippingDetails(shippingDetails, destination) {
  const details = shippingDetails && typeof shippingDetails === 'object' ? shippingDetails : {}
  const address = details.address && typeof details.address === 'object' ? details.address : {}

  return {
    name: String(details.name || destination.name || '').trim() || 'Customer',
    address: {
      line1: String(address.line1 || destination.line1 || '').trim(),
      line2: String(address.line2 || destination.line2 || '').trim() || undefined,
      city: String(address.city || destination.city || '').trim(),
      state: String(address.state || destination.state || '').trim(),
      postal_code: String(
        address.postal_code || address.postalCode || destination.postalCode || '',
      ).trim(),
      country: String(address.country || destination.country || 'US')
        .trim()
        .toUpperCase(),
    },
  }
}

function pickCheckoutRate(quote, selectedRateId) {
  const id = String(selectedRateId || '').trim()
  if (id) {
    const match = quote.rates.find((rate) => rate.id === id)
    if (match) return match
  }
  return quote.rates.find((rate) => rate.id === quote.recommendedRateId) || quote.rates[0] || null
}

module.exports = {
  parseDestinationAddress,
  buildCheckoutShippingQuote,
  dummyStripeShippingOption,
  ratesToStripeShippingOptions,
  toStripeCollectedShippingDetails,
  pickCheckoutRate,
  letterSettingsFromCatalog,
}
