import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { onAuthStateChanged, signOut as fbSignOut, type User } from 'firebase/auth';
import { auth } from './firebase';

interface AuthState {
  user: User | null;
  admin: boolean;
  loading: boolean;
  signOut: () => Promise<void>;
}

const AuthCtx = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [admin, setAdmin] = useState<boolean>(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      if (u) {
        try {
          const tokenResult = await u.getIdTokenResult(true); // force refresh to get latest claims
          const email = u.email || '';

          const adminEmails = (import.meta.env.VITE_ADMIN_EMAILS || '')
            .split(',')
            .map((e: string) => e.trim().toLowerCase())
            .filter(Boolean);

          const isAdmin =
            !!tokenResult.claims.admin ||
            email.endsWith('@adplatform.is') ||
            email === 'admin@a.is' ||
            adminEmails.includes(email.toLowerCase());

          setAdmin(isAdmin);
        } catch {
          setAdmin(false);
        }
      } else {
        setAdmin(false);
      }
      setLoading(false);
    });
    return () => unsub();
  }, []);

  const signOut = async () => {
    localStorage.removeItem('ada_last_role');
    setUser(null);
    setAdmin(false);
    await fbSignOut(auth);
  };

  return <AuthCtx.Provider value={{ user, admin, loading, signOut }}>{children}</AuthCtx.Provider>;
}

export function useAuth(): AuthState {
  const v = useContext(AuthCtx);
  if (!v) throw new Error('useAuth must be used inside AuthProvider');
  return v;
}
