import {
  collection,
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
} from 'firebase/firestore'
import { auth, db } from './firebase'

export type UserProfile = {
  email: string
  notificationsEnabled: boolean
}

export async function getUserProfile(userId: string): Promise<UserProfile | null> {
  const snapshot = await getDoc(doc(db, 'users', userId))
  if (!snapshot.exists()) return null

  const data = snapshot.data()
  return {
    email: typeof data.email === 'string' ? data.email : '',
    notificationsEnabled: data.notificationsEnabled === true,
  }
}

export async function ensureUserProfile(userId: string, email: string): Promise<void> {
  const ref = doc(db, 'users', userId)
  const snapshot = await getDoc(ref)

  if (!snapshot.exists()) {
    await setDoc(ref, {
      email,
      notificationsEnabled: false,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    })
  }
}

export async function setNotificationPreference(
  userId: string,
  email: string,
  enabled: boolean,
): Promise<void> {
  await setDoc(
    doc(db, 'users', userId),
    {
      email,
      notificationsEnabled: enabled,
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  )
}

export async function submitContactMessage(input: {
  name: string
  email: string
  message: string
}): Promise<void> {
  const ref = doc(collection(db, 'contactMessages'))
  await setDoc(ref, {
    name: input.name.trim(),
    email: input.email.trim(),
    message: input.message.trim(),
    read: false,
    createdAt: serverTimestamp(),
  })
}

export async function submitProductReview(
  productId: string,
  userId: string,
  input: { author: string; rating: number; body: string },
): Promise<void> {
  const token = await auth.currentUser?.getIdToken()
  if (!token) throw new Error('Sign in required')

  await setDoc(doc(db, 'products', productId, 'reviews', userId), {
    author: input.author.trim(),
    rating: Math.min(5, Math.max(1, Math.round(input.rating))),
    body: input.body.trim(),
    userId,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  })
}
