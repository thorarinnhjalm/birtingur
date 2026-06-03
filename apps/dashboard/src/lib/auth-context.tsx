import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { onAuthStateChanged, signOut as fbSignOut, type User } from 'firebase/auth';
import { auth } from './firebase';

interface AuthState {
  user: User | null;
  admin: boolean;
  loading: boolean;
  signOut: () => Promise<void>;
  signInDemo: (username: string) => void;
}

const AuthCtx = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<any>(null);
  const [admin, setAdmin] = useState<boolean>(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const mockUserStr = localStorage.getItem('ada_mock_user');
    if (mockUserStr) {
      try {
        const mockUser = JSON.parse(mockUserStr);
        setUser(mockUser);
        setAdmin(mockUser.admin);
        setLoading(false);
        return;
      } catch (e) {
        localStorage.removeItem('ada_mock_user');
      }
    }

    const unsub = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      if (u) {
        try {
          const tokenResult = await u.getIdTokenResult(true); // force refresh to get latest claims
          setAdmin(!!tokenResult.claims.admin || u.email?.endsWith('@adplatform.is') || u.email === 'admin@a.is');
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

  const signInDemo = (username: string) => {
    const mockUser = {
      uid: 'demo-user-id',
      email: `${username.toLowerCase()}@birta.is`,
      displayName: username,
      emailVerified: true,
      isDemo: true,
      admin: true,
      getIdToken: async () => 'demo-mock-token',
      getIdTokenResult: async () => ({
        claims: { admin: true }
      })
    };
    localStorage.setItem('ada_mock_user', JSON.stringify(mockUser));
    setUser(mockUser as unknown as User);
    setAdmin(true);
  };

  const signOut = async () => {
    localStorage.removeItem('ada_mock_user');
    setUser(null);
    setAdmin(false);
    await fbSignOut(auth);
  };

  return (
    <AuthCtx.Provider value={{ user, admin, loading, signOut, signInDemo }}>
      {children}
    </AuthCtx.Provider>
  );
}

export function useAuth(): AuthState {
  const v = useContext(AuthCtx);
  if (!v) throw new Error('useAuth must be used inside AuthProvider');
  return v;
}
