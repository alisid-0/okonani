const { getFirestore, FieldValue } = require('firebase-admin/firestore')
const { POINTS_PER_DOLLAR, REDEEM_POINTS_COST, REDEEM_DISCOUNT_CENTS } = require('./pointsConfig')

function getDb() {
  return getFirestore()
}

function pointsForAmountCents(amountCents) {
  if (!amountCents || amountCents < 0) return 0
  return Math.floor(amountCents / 100) * POINTS_PER_DOLLAR
}

async function getUserPoints(userId) {
  const snapshot = await getDb().collection('users').doc(userId).get()
  if (!snapshot.exists) return 0
  return typeof snapshot.data().points === 'number' ? snapshot.data().points : 0
}

async function getActiveReward(userId, rewardId) {
  const rewardRef = getDb().collection('users').doc(userId).collection('rewards').doc(rewardId)
  const snapshot = await rewardRef.get()

  if (!snapshot.exists) return null

  const data = snapshot.data()
  if (data.status !== 'active' || !data.stripePromotionCodeId) return null

  return {
    id: snapshot.id,
    ...data,
  }
}

async function listActiveRewards(userId) {
  const snapshot = await getDb()
    .collection('users')
    .doc(userId)
    .collection('rewards')
    .where('status', '==', 'active')
    .orderBy('createdAt', 'asc')
    .get()

  return snapshot.docs.map((docSnap) => ({
    id: docSnap.id,
    ...docSnap.data(),
  }))
}

async function awardPointsForCheckoutSession(stripe, session) {
  const userId = session.metadata?.firebaseUid
  if (!userId || session.payment_status !== 'paid') return { awarded: 0 }

  const orderRef = getDb().collection('orders').doc(session.id)
  const existingOrder = await orderRef.get()
  if (existingOrder.exists && existingOrder.data().pointsAwarded != null) {
    await recordPurchasesFromCheckoutSession(stripe, session, userId)
    return { awarded: existingOrder.data().pointsAwarded }
  }

  const amountTotal = session.amount_total ?? 0
  const pointsEarned = pointsForAmountCents(amountTotal)
  const userRef = getDb().collection('users').doc(userId)
  const ledgerRef = userRef.collection('pointLedger').doc(`earn-${session.id}`)

  await getDb().runTransaction(async (tx) => {
    const orderSnap = await tx.get(orderRef)
    if (orderSnap.exists && orderSnap.data().pointsAwarded != null) return

    const userSnap = await tx.get(userRef)
    const currentPoints =
      userSnap.exists && typeof userSnap.data().points === 'number' ? userSnap.data().points : 0

    tx.set(
      orderRef,
      {
        userId,
        stripeSessionId: session.id,
        amountTotal,
        pointsAwarded: pointsEarned,
        paymentStatus: session.payment_status,
        createdAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    )

    if (pointsEarned > 0) {
      tx.set(
        userRef,
        {
          points: currentPoints + pointsEarned,
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true },
      )

      tx.set(ledgerRef, {
        type: 'earn',
        points: pointsEarned,
        orderId: session.id,
        createdAt: FieldValue.serverTimestamp(),
      })
    }
  })

  const rewardId = session.metadata?.rewardId
  if (rewardId) {
    await markRewardUsed(userId, rewardId, session.id)
  } else {
    await markRewardsUsedFromSession(stripe, session, userId)
  }

  await recordPurchasesFromCheckoutSession(stripe, session, userId)

  return { awarded: pointsEarned }
}

async function recordPurchasesFromCheckoutSession(stripe, session, userId) {
  if (!userId || session.payment_status !== 'paid') return

  const expanded = await stripe.checkout.sessions.retrieve(session.id, {
    expand: ['line_items.data.price'],
  })

  const lineItems = expanded.line_items?.data ?? []
  const productIds = new Set()

  for (const item of lineItems) {
    const price = item.price
    const priceId = typeof price === 'object' && price?.id ? price.id : null
    if (!priceId) continue

    const snapshot = await getDb()
      .collection('products')
      .where('stripePriceId', '==', priceId)
      .limit(1)
      .get()

    if (!snapshot.empty) {
      productIds.add(snapshot.docs[0].id)
    }
  }

  if (productIds.size === 0) return

  const batch = getDb().batch()
  const purchasedAt = FieldValue.serverTimestamp()

  for (const productId of productIds) {
    const purchaseRef = getDb()
      .collection('users')
      .doc(userId)
      .collection('purchases')
      .doc(productId)

    batch.set(
      purchaseRef,
      {
        productId,
        orderId: session.id,
        purchasedAt,
      },
      { merge: true },
    )
  }

  batch.set(
    getDb().collection('orders').doc(session.id),
    {
      productIds: [...productIds],
    },
    { merge: true },
  )

  await batch.commit()
}

async function markRewardUsed(userId, rewardId, checkoutSessionId) {
  await getDb()
    .collection('users')
    .doc(userId)
    .collection('rewards')
    .doc(rewardId)
    .set(
      {
        status: 'used',
        usedAt: FieldValue.serverTimestamp(),
        checkoutSessionId,
      },
      { merge: true },
    )
}

async function markRewardsUsedFromSession(stripe, session, userId) {
  if (!session.total_details?.amount_discount) return

  const expanded = await stripe.checkout.sessions.retrieve(session.id, {
    expand: ['total_details.breakdown.discounts.discount.promotion_code'],
  })

  const discounts = expanded.total_details?.breakdown?.discounts ?? []

  for (const entry of discounts) {
    const promotionCode = entry.discount?.promotion_code
    const rewardId =
      typeof promotionCode === 'object' && promotionCode?.metadata?.rewardId ?
        promotionCode.metadata.rewardId
      : null

    if (rewardId && promotionCode?.metadata?.firebaseUid === userId) {
      await markRewardUsed(userId, rewardId, session.id)
    }
  }
}

async function redeemPointsForCoupon(stripe, userId) {
  const userRef = getDb().collection('users').doc(userId)
  const rewardRef = userRef.collection('rewards').doc()
  const ledgerRef = userRef.collection('pointLedger').doc(`redeem-${rewardRef.id}`)

  let newBalance = 0

  await getDb().runTransaction(async (tx) => {
    const userSnap = await tx.get(userRef)
    const currentPoints =
      userSnap.exists && typeof userSnap.data().points === 'number' ? userSnap.data().points : 0

    if (currentPoints < REDEEM_POINTS_COST) {
      const error = new Error(`Need at least ${REDEEM_POINTS_COST} points to redeem`)
      error.status = 400
      throw error
    }

    newBalance = currentPoints - REDEEM_POINTS_COST

    tx.set(
      userRef,
      {
        points: newBalance,
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    )

    tx.set(rewardRef, {
      status: 'pending',
      pointsSpent: REDEEM_POINTS_COST,
      discountCents: REDEEM_DISCOUNT_CENTS,
      createdAt: FieldValue.serverTimestamp(),
    })

    tx.set(ledgerRef, {
      type: 'redeem',
      points: -REDEEM_POINTS_COST,
      rewardId: rewardRef.id,
      createdAt: FieldValue.serverTimestamp(),
    })
  })

  try {
    const coupon = await stripe.coupons.create({
      amount_off: REDEEM_DISCOUNT_CENTS,
      currency: 'usd',
      duration: 'once',
      name: 'Okonani rewards',
    })

    const promotionCode = await stripe.promotionCodes.create({
      coupon: coupon.id,
      max_redemptions: 1,
      metadata: {
        firebaseUid: userId,
        rewardId: rewardRef.id,
        source: 'okonani-rewards',
      },
    })

    await rewardRef.set(
      {
        status: 'active',
        code: promotionCode.code,
        stripePromotionCodeId: promotionCode.id,
        stripeCouponId: coupon.id,
      },
      { merge: true },
    )

    return {
      rewardId: rewardRef.id,
      code: promotionCode.code,
      promotionCodeId: promotionCode.id,
      discountCents: REDEEM_DISCOUNT_CENTS,
      pointsSpent: REDEEM_POINTS_COST,
      pointsRemaining: newBalance,
    }
  } catch (err) {
    await getDb().runTransaction(async (tx) => {
      const userSnap = await tx.get(userRef)
      const currentPoints =
        userSnap.exists && typeof userSnap.data().points === 'number' ? userSnap.data().points : 0

      tx.set(
        userRef,
        {
          points: currentPoints + REDEEM_POINTS_COST,
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true },
      )

      tx.delete(rewardRef)
      tx.delete(ledgerRef)
    })

    throw err
  }
}

module.exports = {
  POINTS_PER_DOLLAR,
  REDEEM_POINTS_COST,
  REDEEM_DISCOUNT_CENTS,
  pointsForAmountCents,
  getUserPoints,
  getActiveReward,
  listActiveRewards,
  awardPointsForCheckoutSession,
  redeemPointsForCoupon,
  recordPurchasesFromCheckoutSession,
}
