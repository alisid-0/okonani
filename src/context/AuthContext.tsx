import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  type User,
} from 'firebase/auth'
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { checkAdminAccess } from '../lib/adminApi'
import { auth } from '../lib/firebase'
import { ensureUserProfile } from '../lib/userApi'

type AuthContextValue = {
  user: User | null
  loading: boolean
  isAdmin: boolean
  signIn: (email: string, password: string) => Promise<void>
  signUp: (email: string, password: string) => Promise<void>
  logOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [isAdmin, setIsAdmin] = useState(false)

  useEffect(() => {
    return onAuthStateChanged(auth, (nextUser) => {
      setUser(nextUser)
      setLoading(false)
    })
  }, [])

  useEffect(() => {
    let ignore = false

    async function loadAdminStatus() {
      if (!user) {
        if (!ignore) setIsAdmin(false)
        return
      }

      try {
        const data = await checkAdminAccess()
        if (data.claimsUpdated && auth.currentUser) {
          await auth.currentUser.getIdToken(true)
        }
        if (!ignore) setIsAdmin(data.isAdmin)
      } catch {
        if (!ignore) setIsAdmin(false)
      }
    }

    loadAdminStatus()

    return () => {
      ignore = true
    }
  }, [user])

  const signIn = useCallback(async (email: string, password: string) => {
    const credential = await signInWithEmailAndPassword(auth, email, password)
    if (credential.user.email) {
      await ensureUserProfile(credential.user.uid, credential.user.email)
    }
  }, [])

  const signUp = useCallback(async (email: string, password: string) => {
    const credential = await createUserWithEmailAndPassword(auth, email, password)
    if (credential.user.email) {
      await ensureUserProfile(credential.user.uid, credential.user.email)
    }
  }, [])

  const logOut = useCallback(async () => {
    await signOut(auth)
  }, [])

  const value = useMemo(
    () => ({
      user,
      loading,
      isAdmin,
      signIn,
      signUp,
      logOut,
    }),
    [user, loading, isAdmin, signIn, signUp, logOut],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
