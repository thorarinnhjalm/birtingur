# ADA Hosted Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans.

**Goal:** Build the React 19 + Vite + Tailwind v4 dashboard app covering advertiser, publisher, and admin surfaces per the UI design spec.

**Architecture:** Single React app served from Vercel static build. Firebase Auth (Google + email/password) handles sign-in. TanStack Query for server state. React Router v7 for routing. Tailwind v4 + Radix UI primitives + Recharts. i18n via react-i18next (Icelandic-only V1 with English-ready keys).

**Tech Stack:** React 19, Vite, Tailwind v4, Firebase Auth (web), TanStack Query v5, React Router v7, Radix UI, Recharts, react-hook-form, Zod (via @ada/shared), react-i18next.

**Depends on:** Plans #1, #2, #4, #5, #6.

**Companion spec:** UI Design Spec (entire document).

---

## File Structure

```
apps/dashboard/
├── package.json
├── tsconfig.json
├── vite.config.ts
├── tailwind.config.ts
├── postcss.config.js
├── index.html
├── public/
│   └── favicon.svg
├── src/
│   ├── main.tsx
│   ├── App.tsx
│   ├── i18n.ts
│   ├── styles.css
│   ├── lib/
│   │   ├── firebase.ts                # client-side Firebase init
│   │   ├── api.ts                     # fetchApi(path, opts) wrapper with auth
│   │   ├── auth-context.tsx           # AuthProvider, useAuth
│   │   ├── query.ts                   # TanStack Query client
│   │   ├── format.ts                  # re-export @ada/shared/formatting helpers
│   │   └── routes.ts                  # route constants
│   ├── components/
│   │   ├── ui/                        # PrimaryButton, Card, StatCard, Badge, Modal, Input, EmptyState, LoadingState, ErrorState
│   │   ├── layout/                    # AppShell, Sidebar, TopBar
│   │   └── charts/                    # LineChart, BarChart, Sparkline
│   ├── pages/
│   │   ├── SignIn.tsx
│   │   ├── RoleSelect.tsx
│   │   ├── advertiser/
│   │   │   ├── Dashboard.tsx
│   │   │   ├── TopUp.tsx
│   │   │   ├── CampaignCreate.tsx     # Multi-step wizard
│   │   │   ├── CampaignList.tsx
│   │   │   ├── CampaignDetail.tsx
│   │   │   ├── CreativeLibrary.tsx
│   │   │   └── Settings.tsx
│   │   ├── publisher/
│   │   │   ├── Dashboard.tsx
│   │   │   ├── SlotCreate.tsx
│   │   │   ├── SlotList.tsx
│   │   │   ├── SlotDetail.tsx
│   │   │   ├── Earnings.tsx
│   │   │   ├── ApprovalQueue.tsx
│   │   │   └── Settings.tsx
│   │   └── admin/
│   │       ├── Overview.tsx
│   │       ├── ReviewQueue.tsx
│   │       ├── PayoutQueue.tsx
│   │       ├── PublisherManagement.tsx
│   │       ├── AdvertiserManagement.tsx
│   │       └── SystemSettings.tsx
│   ├── hooks/
│   │   ├── useAdvertiser.ts
│   │   ├── usePublisher.ts
│   │   ├── useCampaigns.ts
│   │   ├── useWallet.ts
│   │   └── useReviewQueue.ts
│   └── locales/
│       └── is.json
└── tests/
    └── (vitest unit tests for utilities; visual testing handled by Stitch + manual review)
```

---

## Task 1: Scaffold dashboard app

**Files:** `apps/dashboard/package.json`, `vite.config.ts`, `index.html`, `tsconfig.json`, base CSS

- [ ] **Step 1: Directories**

```bash
cd /Users/thorarinnhjalmarsson/Documents/Antigravity/ada
mkdir -p apps/dashboard/src/{lib,components/{ui,layout,charts},pages/{advertiser,publisher,admin},hooks,locales} apps/dashboard/public apps/dashboard/tests
```

- [ ] **Step 2: package.json**

Write `/Users/thorarinnhjalmarsson/Documents/Antigravity/ada/apps/dashboard/package.json`:

```json
{
  "name": "@ada/dashboard",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "preview": "vite preview",
    "test": "vitest run",
    "typecheck": "tsc -b --noEmit",
    "lint": "eslint src"
  },
  "dependencies": {
    "@ada/shared": "workspace:*",
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "react-router-dom": "^7.0.0",
    "@tanstack/react-query": "^5.40.0",
    "firebase": "^10.12.0",
    "react-hook-form": "^7.51.0",
    "@hookform/resolvers": "^3.6.0",
    "zod": "^3.23.0",
    "recharts": "^2.12.0",
    "react-i18next": "^14.1.0",
    "i18next": "^23.11.0",
    "@radix-ui/react-dialog": "^1.1.0",
    "@radix-ui/react-dropdown-menu": "^2.1.0",
    "@radix-ui/react-toast": "^1.2.0",
    "@radix-ui/react-tabs": "^1.1.0",
    "lucide-react": "^0.395.0",
    "clsx": "^2.1.0"
  },
  "devDependencies": {
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "@vitejs/plugin-react": "^4.3.0",
    "tailwindcss": "^4.0.0",
    "@tailwindcss/postcss": "^4.0.0",
    "autoprefixer": "^10.4.0",
    "postcss": "^8.4.0",
    "typescript": "^5.4.0",
    "vite": "^5.3.0",
    "vitest": "^1.5.0",
    "jsdom": "^24.0.0"
  }
}
```

- [ ] **Step 3: configs**

Write `/Users/thorarinnhjalmarsson/Documents/Antigravity/ada/apps/dashboard/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src",
    "jsx": "react-jsx",
    "moduleResolution": "Bundler",
    "module": "ESNext",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "paths": { "@/*": ["./src/*"] }
  },
  "include": ["src/**/*", "tests/**/*"]
}
```

Write `/Users/thorarinnhjalmarsson/Documents/Antigravity/ada/apps/dashboard/vite.config.ts`:

```ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { '@': path.resolve(__dirname, 'src') } },
  server: { port: 3000 },
  test: {
    environment: 'jsdom',
    globals: true,
    include: ['tests/**/*.test.tsx', 'tests/**/*.test.ts'],
  },
});
```

Write `/Users/thorarinnhjalmarsson/Documents/Antigravity/ada/apps/dashboard/postcss.config.js`:

```js
export default {
  plugins: { '@tailwindcss/postcss': {}, autoprefixer: {} },
};
```

Write `/Users/thorarinnhjalmarsson/Documents/Antigravity/ada/apps/dashboard/tailwind.config.ts`:

```ts
import type { Config } from 'tailwindcss';

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: { DEFAULT: '#1e3a8a', 800: '#1e40af', 700: '#1d4ed8' },
        sky: { DEFAULT: '#0ea5e9' },
      },
      fontFamily: { sans: ['Inter', 'system-ui', 'sans-serif'] },
      borderRadius: { card: '12px' },
    },
  },
} satisfies Config;
```

- [ ] **Step 4: index.html and main.tsx**

Write `/Users/thorarinnhjalmarsson/Documents/Antigravity/ada/apps/dashboard/index.html`:

```html
<!doctype html>
<html lang="is">
  <head>
    <meta charset="UTF-8" />
    <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>ADA — Auglýsingavettvangur</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

Write `/Users/thorarinnhjalmarsson/Documents/Antigravity/ada/apps/dashboard/src/styles.css`:

```css
@import 'tailwindcss';

:root {
  font-family: Inter, system-ui, sans-serif;
  color: #0f172a;
}
body {
  margin: 0;
  background: #ffffff;
}
```

Write `/Users/thorarinnhjalmarsson/Documents/Antigravity/ada/apps/dashboard/src/main.tsx`:

```tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';
import { queryClient } from './lib/query';
import { AuthProvider } from './lib/auth-context';
import App from './App';
import './styles.css';
import './i18n';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthProvider>
          <App />
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
);
```

- [ ] **Step 5: Install + commit**

```bash
cd /Users/thorarinnhjalmarsson/Documents/Antigravity/ada
pnpm install
git add apps/dashboard package.json pnpm-lock.yaml
git commit -m "chore(dashboard): scaffold React 19 + Vite + Tailwind v4"
```

---

## Task 2: Firebase client, API helper, query client, i18n

**Files:** `src/lib/firebase.ts`, `src/lib/api.ts`, `src/lib/query.ts`, `src/lib/auth-context.tsx`, `src/i18n.ts`, `src/locales/is.json`

- [ ] **Step 1: Firebase client**

Write `/Users/thorarinnhjalmarsson/Documents/Antigravity/ada/apps/dashboard/src/lib/firebase.ts`:

```ts
import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

export const firebaseApp = initializeApp(firebaseConfig);
export const auth = getAuth(firebaseApp);
export const googleProvider = new GoogleAuthProvider();
```

- [ ] **Step 2: API helper**

Write `/Users/thorarinnhjalmarsson/Documents/Antigravity/ada/apps/dashboard/src/lib/api.ts`:

```ts
import { auth } from './firebase';

const API_BASE = import.meta.env.VITE_API_BASE ?? 'https://api.birtingur.app';

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

export async function apiFetch<T>(path: string, opts: RequestInit = {}): Promise<T> {
  const user = auth.currentUser;
  const token = user ? await user.getIdToken() : null;
  const headers = new Headers(opts.headers ?? {});
  if (token) headers.set('Authorization', `Bearer ${token}`);
  if (opts.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  const res = await fetch(`${API_BASE}${path}`, { ...opts, headers });
  if (!res.ok) {
    let body: { error?: string; message?: string; details?: unknown } = {};
    try {
      body = await res.json();
    } catch {
      /* ignore */
    }
    throw new ApiError(
      res.status,
      body.error ?? 'unknown',
      body.message ?? res.statusText,
      body.details,
    );
  }
  return res.json() as Promise<T>;
}
```

- [ ] **Step 3: Query client**

Write `/Users/thorarinnhjalmarsson/Documents/Antigravity/ada/apps/dashboard/src/lib/query.ts`:

```ts
import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000, retry: 1, refetchOnWindowFocus: false },
  },
});
```

- [ ] **Step 4: Auth context**

Write `/Users/thorarinnhjalmarsson/Documents/Antigravity/ada/apps/dashboard/src/lib/auth-context.tsx`:

```tsx
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { onAuthStateChanged, signOut as fbSignOut, type User } from 'firebase/auth';
import { auth } from './firebase';

interface AuthState {
  user: User | null;
  loading: boolean;
  signOut: () => Promise<void>;
}

const AuthCtx = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setLoading(false);
    });
    return () => unsub();
  }, []);

  return (
    <AuthCtx.Provider value={{ user, loading, signOut: () => fbSignOut(auth) }}>
      {children}
    </AuthCtx.Provider>
  );
}

export function useAuth(): AuthState {
  const v = useContext(AuthCtx);
  if (!v) throw new Error('useAuth outside AuthProvider');
  return v;
}
```

- [ ] **Step 5: i18n**

Write `/Users/thorarinnhjalmarsson/Documents/Antigravity/ada/apps/dashboard/src/i18n.ts`:

```ts
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import is from './locales/is.json';

i18n.use(initReactI18next).init({
  resources: { is: { translation: is } },
  lng: 'is',
  fallbackLng: 'is',
  interpolation: { escapeValue: false },
});

export default i18n;
```

Write `/Users/thorarinnhjalmarsson/Documents/Antigravity/ada/apps/dashboard/src/locales/is.json`:

```json
{
  "app": {
    "name": "ADA",
    "tagline": "Sjálfsafgreiðslu auglýsingavettvangur"
  },
  "nav": {
    "overview": "Yfirlit",
    "campaigns": "Herferðir",
    "wallet": "Veski",
    "creatives": "Auglýsingaefni",
    "settings": "Stillingar",
    "slots": "Auglýsingapláss",
    "earnings": "Tekjur",
    "approvals": "Samþykktir",
    "reviewQueue": "Yfirferð",
    "payouts": "Útborganir",
    "publishers": "Útgefendur",
    "advertisers": "Auglýsendur",
    "stats": "Tölfræði",
    "system": "Kerfi"
  },
  "auth": {
    "signIn": "Skrá inn",
    "signInGoogle": "Halda áfram með Google",
    "signOut": "Skrá út",
    "emailLabel": "Netfang",
    "passwordLabel": "Lykilorð",
    "noAccount": "Ertu ekki með aðgang?",
    "createAccount": "Skráðu þig nýjan"
  },
  "wallet": {
    "title": "Veski",
    "balance": "Inneign",
    "topUp": "Setja inn inneign",
    "amount": "Upphæð",
    "vatIncluded": "VSK 24% innifalið",
    "payWithCard": "Greiða með korti",
    "processedByTeya": "Greitt í gegnum Teya"
  },
  "common": {
    "save": "Vista",
    "cancel": "Hætta við",
    "next": "Næsta",
    "back": "Til baka",
    "approve": "Samþykkja",
    "reject": "Hafna",
    "delete": "Eyða",
    "edit": "Breyta",
    "loading": "Hleður...",
    "retry": "Reyna aftur",
    "empty": "Engin gögn"
  }
}
```

- [ ] **Step 6: Commit**

```bash
git add apps/dashboard/src/lib apps/dashboard/src/i18n.ts apps/dashboard/src/locales apps/dashboard/src/styles.css apps/dashboard/src/main.tsx apps/dashboard/index.html apps/dashboard/postcss.config.js apps/dashboard/tailwind.config.ts apps/dashboard/vite.config.ts apps/dashboard/tsconfig.json
git commit -m "feat(dashboard): firebase + api + i18n + auth context"
```

---

## Task 3: UI primitives

**Files:** `src/components/ui/*.tsx`

- [ ] **Step 1: Implement primitives**

Write `/Users/thorarinnhjalmarsson/Documents/Antigravity/ada/apps/dashboard/src/components/ui/Button.tsx`:

```tsx
import { type ButtonHTMLAttributes, forwardRef } from 'react';
import clsx from 'clsx';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  loading?: boolean;
}

const styles: Record<Variant, string> = {
  primary: 'bg-primary text-white hover:bg-primary-800 active:bg-primary-700 disabled:bg-slate-300',
  secondary: 'bg-white border border-primary text-primary hover:bg-slate-50',
  ghost: 'text-slate-600 hover:bg-slate-100',
  danger: 'bg-red-600 text-white hover:bg-red-700',
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'primary', loading, className, children, disabled, ...rest }, ref) => (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={clsx(
        'inline-flex items-center justify-center px-5 py-3 rounded-lg font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2',
        styles[variant],
        className,
      )}
      {...rest}
    >
      {loading ? '...' : children}
    </button>
  ),
);
Button.displayName = 'Button';
```

Write `/Users/thorarinnhjalmarsson/Documents/Antigravity/ada/apps/dashboard/src/components/ui/Card.tsx`:

```tsx
import type { HTMLAttributes } from 'react';
import clsx from 'clsx';

export function Card({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={clsx(
        'bg-white border border-slate-200 rounded-card p-6 shadow-[0_1px_2px_rgba(0,0,0,0.05)]',
        className,
      )}
      {...rest}
    />
  );
}
```

Write `/Users/thorarinnhjalmarsson/Documents/Antigravity/ada/apps/dashboard/src/components/ui/StatCard.tsx`:

```tsx
import { Card } from './Card';
import clsx from 'clsx';

interface Props {
  label: string;
  value: string;
  delta?: { value: string; positive: boolean };
}

export function StatCard({ label, value, delta }: Props) {
  return (
    <Card>
      <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">{label}</div>
      <div className="mt-2 text-3xl font-semibold text-slate-900">{value}</div>
      {delta && (
        <div className={clsx('mt-1 text-sm', delta.positive ? 'text-green-600' : 'text-red-600')}>
          {delta.positive ? '↑' : '↓'} {delta.value}
        </div>
      )}
    </Card>
  );
}
```

Write `/Users/thorarinnhjalmarsson/Documents/Antigravity/ada/apps/dashboard/src/components/ui/Badge.tsx`:

```tsx
import clsx from 'clsx';
import type { ReactNode } from 'react';

type Variant = 'success' | 'pending' | 'danger' | 'info' | 'neutral';
const styles: Record<Variant, string> = {
  success: 'bg-green-100 text-green-800',
  pending: 'bg-yellow-100 text-yellow-800',
  danger: 'bg-red-100 text-red-800',
  info: 'bg-blue-100 text-blue-800',
  neutral: 'bg-slate-100 text-slate-700',
};

export function Badge({ variant, children }: { variant: Variant; children: ReactNode }) {
  return (
    <span
      className={clsx('inline-block px-2 py-0.5 text-xs font-semibold rounded-md', styles[variant])}
    >
      {children}
    </span>
  );
}
```

Write `/Users/thorarinnhjalmarsson/Documents/Antigravity/ada/apps/dashboard/src/components/ui/Input.tsx`:

```tsx
import { type InputHTMLAttributes, forwardRef } from 'react';
import clsx from 'clsx';

interface Props extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

export const Input = forwardRef<HTMLInputElement, Props>(
  ({ label, error, className, ...rest }, ref) => (
    <label className="block">
      {label && <span className="block text-sm font-medium text-slate-700 mb-1">{label}</span>}
      <input
        ref={ref}
        className={clsx(
          'w-full px-4 py-3 border rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-primary',
          error ? 'border-red-500' : 'border-slate-300',
          className,
        )}
        {...rest}
      />
      {error && <span className="block mt-1 text-sm text-red-600">{error}</span>}
    </label>
  ),
);
Input.displayName = 'Input';
```

Write `/Users/thorarinnhjalmarsson/Documents/Antigravity/ada/apps/dashboard/src/components/ui/EmptyState.tsx`:

```tsx
import type { ReactNode } from 'react';

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="text-center py-16">
      {icon && <div className="mx-auto mb-4 text-slate-400">{icon}</div>}
      <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
      {description && <p className="mt-2 text-sm text-slate-600">{description}</p>}
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}
```

Write `/Users/thorarinnhjalmarsson/Documents/Antigravity/ada/apps/dashboard/src/components/ui/LoadingState.tsx`:

```tsx
export function LoadingState() {
  return (
    <div className="space-y-3 py-8">
      <div className="h-4 bg-slate-200 rounded animate-pulse w-1/2" />
      <div className="h-4 bg-slate-200 rounded animate-pulse w-2/3" />
      <div className="h-4 bg-slate-200 rounded animate-pulse w-1/3" />
    </div>
  );
}
```

Write `/Users/thorarinnhjalmarsson/Documents/Antigravity/ada/apps/dashboard/src/components/ui/ErrorState.tsx`:

```tsx
import { Button } from './Button';

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="bg-red-50 border border-red-200 rounded-lg p-6 text-center">
      <p className="text-red-700 font-medium">{message}</p>
      {onRetry && (
        <Button variant="secondary" className="mt-4" onClick={onRetry}>
          Reyna aftur
        </Button>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/dashboard/src/components/ui
git commit -m "feat(dashboard): UI primitives (Button, Card, StatCard, Badge, Input, EmptyState, LoadingState, ErrorState)"
```

---

## Task 4: Layout shell with sidebar

**Files:** `src/components/layout/AppShell.tsx`, `Sidebar.tsx`, `TopBar.tsx`

- [ ] **Step 1: Implement**

Write `/Users/thorarinnhjalmarsson/Documents/Antigravity/ada/apps/dashboard/src/components/layout/Sidebar.tsx`:

```tsx
import { NavLink } from 'react-router-dom';
import clsx from 'clsx';
import type { ReactNode } from 'react';

export interface SidebarItem {
  to: string;
  label: string;
  icon: ReactNode;
}

export function Sidebar({ items }: { items: SidebarItem[] }) {
  return (
    <nav className="w-60 bg-white border-r border-slate-200 p-4 flex flex-col gap-1">
      <div className="text-2xl font-semibold text-primary mb-8 px-2">ADA</div>
      {items.map((it) => (
        <NavLink
          key={it.to}
          to={it.to}
          className={({ isActive }) =>
            clsx(
              'flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium',
              isActive ? 'bg-primary text-white' : 'text-slate-700 hover:bg-slate-100',
            )
          }
        >
          {it.icon}
          {it.label}
        </NavLink>
      ))}
    </nav>
  );
}
```

Write `/Users/thorarinnhjalmarsson/Documents/Antigravity/ada/apps/dashboard/src/components/layout/TopBar.tsx`:

```tsx
import { useAuth } from '@/lib/auth-context';
import { Button } from '../ui/Button';

export function TopBar() {
  const { user, signOut } = useAuth();
  return (
    <div className="h-16 border-b border-slate-200 px-8 flex items-center justify-end gap-4">
      <span className="text-sm text-slate-700">{user?.email}</span>
      <Button variant="ghost" onClick={signOut}>
        Skrá út
      </Button>
    </div>
  );
}
```

Write `/Users/thorarinnhjalmarsson/Documents/Antigravity/ada/apps/dashboard/src/components/layout/AppShell.tsx`:

```tsx
import type { ReactNode } from 'react';
import { Sidebar, type SidebarItem } from './Sidebar';
import { TopBar } from './TopBar';

export function AppShell({ items, children }: { items: SidebarItem[]; children: ReactNode }) {
  return (
    <div className="min-h-screen flex">
      <Sidebar items={items} />
      <div className="flex-1 flex flex-col">
        <TopBar />
        <main className="flex-1 p-8 bg-slate-50">{children}</main>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/dashboard/src/components/layout
git commit -m "feat(dashboard): AppShell with sidebar + topbar"
```

---

## Task 5: Sign-in & role selection

**Files:** `src/pages/SignIn.tsx`, `RoleSelect.tsx`, `src/App.tsx`

- [ ] **Step 1: Sign-in page**

Write `/Users/thorarinnhjalmarsson/Documents/Antigravity/ada/apps/dashboard/src/pages/SignIn.tsx`:

```tsx
import { useState } from 'react';
import { signInWithEmailAndPassword, signInWithPopup } from 'firebase/auth';
import { useNavigate } from 'react-router-dom';
import { auth, googleProvider } from '@/lib/firebase';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Card } from '@/components/ui/Card';

export default function SignIn() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  async function handleGoogle() {
    setError(null);
    try {
      await signInWithPopup(auth, googleProvider);
      navigate('/');
    } catch (e) {
      setError(String(e));
    }
  }

  async function handleEmail(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await signInWithEmailAndPassword(auth, email, password);
      navigate('/');
    } catch (err) {
      setError('Innskráning mistókst');
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
      <Card className="w-full max-w-md">
        <h1 className="text-2xl font-semibold text-center text-primary">ADA</h1>
        <p className="text-center text-slate-600 mt-2">Skráðu þig inn til að halda áfram</p>

        <Button className="w-full mt-6" variant="secondary" onClick={handleGoogle}>
          Halda áfram með Google
        </Button>

        <div className="flex items-center my-6">
          <div className="flex-1 border-t border-slate-200" />
          <span className="px-3 text-sm text-slate-500">eða</span>
          <div className="flex-1 border-t border-slate-200" />
        </div>

        <form onSubmit={handleEmail} className="space-y-4">
          <Input
            label="Netfang"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <Input
            label="Lykilorð"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          <Button type="submit" className="w-full">
            Skrá inn
          </Button>
          {error && <p className="text-sm text-red-600">{error}</p>}
        </form>
      </Card>
    </div>
  );
}
```

- [ ] **Step 2: Role select**

Write `/Users/thorarinnhjalmarsson/Documents/Antigravity/ada/apps/dashboard/src/pages/RoleSelect.tsx`:

```tsx
import { useNavigate } from 'react-router-dom';
import { Card } from '@/components/ui/Card';

export default function RoleSelect() {
  const nav = useNavigate();
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
      <div className="grid sm:grid-cols-2 gap-4 max-w-3xl">
        <Card
          className="cursor-pointer hover:shadow-md transition"
          onClick={() => nav('/advertiser/onboarding')}
        >
          <h3 className="text-lg font-semibold">Ég vil birta auglýsingar</h3>
          <p className="text-sm text-slate-600 mt-2">
            Settu inn inneign, hladdu upp auglýsingu og veldu pláss á íslenskum vefjum.
          </p>
        </Card>
        <Card
          className="cursor-pointer hover:shadow-md transition"
          onClick={() => nav('/publisher/onboarding')}
        >
          <h3 className="text-lg font-semibold">Ég er með vef og vil selja pláss</h3>
          <p className="text-sm text-slate-600 mt-2">
            Búðu til auglýsingapláss og fáðu tekjur af þínum vef.
          </p>
        </Card>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: App routing skeleton**

Write `/Users/thorarinnhjalmarsson/Documents/Antigravity/ada/apps/dashboard/src/App.tsx`:

```tsx
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from '@/lib/auth-context';
import SignIn from '@/pages/SignIn';
import RoleSelect from '@/pages/RoleSelect';
import AdvertiserDashboard from '@/pages/advertiser/Dashboard';
import PublisherDashboard from '@/pages/publisher/Dashboard';
import AdminOverview from '@/pages/admin/Overview';
import { LoadingState } from '@/components/ui/LoadingState';

function Protected({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <LoadingState />;
  if (!user) return <Navigate to="/sign-in" replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <Routes>
      <Route path="/sign-in" element={<SignIn />} />
      <Route
        path="/role"
        element={
          <Protected>
            <RoleSelect />
          </Protected>
        }
      />
      <Route
        path="/advertiser/*"
        element={
          <Protected>
            <AdvertiserDashboard />
          </Protected>
        }
      />
      <Route
        path="/publisher/*"
        element={
          <Protected>
            <PublisherDashboard />
          </Protected>
        }
      />
      <Route
        path="/admin/*"
        element={
          <Protected>
            <AdminOverview />
          </Protected>
        }
      />
      <Route path="/" element={<Navigate to="/role" replace />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
```

- [ ] **Step 4: Commit**

```bash
git add apps/dashboard/src/pages/SignIn.tsx apps/dashboard/src/pages/RoleSelect.tsx apps/dashboard/src/App.tsx
git commit -m "feat(dashboard): sign-in, role select, app routing"
```

---

## Task 6: Advertiser hooks and Dashboard page

**Files:** `src/hooks/useAdvertiser.ts`, `useWallet.ts`, `useCampaigns.ts`, `src/pages/advertiser/Dashboard.tsx`

- [ ] **Step 1: Hooks**

Write `/Users/thorarinnhjalmarsson/Documents/Antigravity/ada/apps/dashboard/src/hooks/useAdvertiser.ts`:

```ts
import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import type { Advertiser } from '@ada/shared';

export function useAdvertiser() {
  return useQuery({
    queryKey: ['advertiser', 'me'],
    queryFn: () =>
      apiFetch<{ advertiser: Advertiser }>('/v1/advertisers/me').then((r) => r.advertiser),
  });
}
```

Write `/Users/thorarinnhjalmarsson/Documents/Antigravity/ada/apps/dashboard/src/hooks/useWallet.ts`:

```ts
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';

interface Wallet {
  advertiserId: string;
  balanceIsk: number;
}

export function useWallet() {
  return useQuery({
    queryKey: ['wallet'],
    queryFn: () => apiFetch<{ wallet: Wallet }>('/v1/advertisers/me/wallet').then((r) => r.wallet),
  });
}

export function useTopUp() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (amountIsk: number) =>
      apiFetch<{ checkoutUrl: string; sessionId: string }>('/v1/advertisers/me/wallet/topup', {
        method: 'POST',
        body: JSON.stringify({ amountIsk }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['wallet'] }),
  });
}
```

Write `/Users/thorarinnhjalmarsson/Documents/Antigravity/ada/apps/dashboard/src/hooks/useCampaigns.ts`:

```ts
import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import type { Campaign } from '@ada/shared';

export function useCampaigns() {
  return useQuery({
    queryKey: ['campaigns'],
    queryFn: () => apiFetch<{ campaigns: Campaign[] }>('/v1/campaigns').then((r) => r.campaigns),
  });
}
```

- [ ] **Step 2: Advertiser Dashboard**

Write `/Users/thorarinnhjalmarsson/Documents/Antigravity/ada/apps/dashboard/src/pages/advertiser/Dashboard.tsx`:

```tsx
import { Routes, Route, useNavigate } from 'react-router-dom';
import {
  Megaphone,
  Wallet,
  Image as ImageIcon,
  Settings as SettingsIcon,
  LayoutGrid,
} from 'lucide-react';
import { AppShell } from '@/components/layout/AppShell';
import { useAdvertiser } from '@/hooks/useAdvertiser';
import { useWallet } from '@/hooks/useWallet';
import { useCampaigns } from '@/hooks/useCampaigns';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { StatCard } from '@/components/ui/StatCard';
import { EmptyState } from '@/components/ui/EmptyState';
import { LoadingState } from '@/components/ui/LoadingState';
import { Badge } from '@/components/ui/Badge';
import { formatIsk } from '@ada/shared';
import TopUp from './TopUp';
import CampaignCreate from './CampaignCreate';
import CampaignList from './CampaignList';
import CampaignDetail from './CampaignDetail';
import CreativeLibrary from './CreativeLibrary';
import Settings from './Settings';

function Home() {
  const adv = useAdvertiser();
  const wallet = useWallet();
  const campaigns = useCampaigns();
  const navigate = useNavigate();

  if (adv.isLoading || wallet.isLoading || campaigns.isLoading) return <LoadingState />;
  if (!adv.data) {
    return (
      <EmptyState
        title="Auglýsendaaðgangur ekki stofnaður"
        description="Þú þarft að klára skráningu áður en þú getur birt auglýsingar."
        action={<Button onClick={() => navigate('/advertiser/onboarding')}>Klára skráningu</Button>}
      />
    );
  }

  return (
    <div className="space-y-8 max-w-6xl">
      <Card>
        <div className="text-xs uppercase font-semibold text-slate-500 tracking-wider">Veski</div>
        <div className="mt-2 text-4xl font-semibold text-slate-900">
          {formatIsk(wallet.data?.balanceIsk ?? 0)}
        </div>
        <Button className="mt-4" onClick={() => navigate('/advertiser/topup')}>
          + Setja inn inneign
        </Button>
      </Card>

      <div className="grid sm:grid-cols-3 gap-4">
        <StatCard label="Birtingar" value="0" />
        <StatCard label="Smellir" value="0" />
        <StatCard label="CTR" value="0%" />
      </div>

      <div>
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg font-semibold text-slate-900">Virkar herferðir</h2>
          <Button onClick={() => navigate('/advertiser/campaigns/new')}>+ Ný herferð</Button>
        </div>
        {(campaigns.data ?? []).length === 0 ? (
          <EmptyState
            title="Engar herferðir enn"
            description="Stofnaðu þína fyrstu herferð til að byrja að birta."
            action={
              <Button onClick={() => navigate('/advertiser/campaigns/new')}>Búa til herferð</Button>
            }
          />
        ) : (
          <div className="space-y-3">
            {campaigns.data!.map((c) => (
              <Card
                key={c.id}
                className="flex justify-between items-center cursor-pointer"
                onClick={() => navigate(`/advertiser/campaigns/${c.id}`)}
              >
                <div>
                  <div className="font-medium">{c.id}</div>
                  <div className="text-sm text-slate-600">
                    {c.targeting.slotIds.length} vefir ·{' '}
                    {formatIsk(c.budget.totalIsk - c.budget.remainingIsk)} /{' '}
                    {formatIsk(c.budget.totalIsk)}
                  </div>
                </div>
                <Badge
                  variant={
                    c.status === 'active'
                      ? 'success'
                      : c.status === 'pending_approval'
                        ? 'pending'
                        : 'neutral'
                  }
                >
                  {c.status}
                </Badge>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

const sidebarItems = [
  { to: '/advertiser', label: 'Yfirlit', icon: <LayoutGrid size={18} /> },
  { to: '/advertiser/campaigns', label: 'Herferðir', icon: <Megaphone size={18} /> },
  { to: '/advertiser/topup', label: 'Veski', icon: <Wallet size={18} /> },
  { to: '/advertiser/creatives', label: 'Auglýsingaefni', icon: <ImageIcon size={18} /> },
  { to: '/advertiser/settings', label: 'Stillingar', icon: <SettingsIcon size={18} /> },
];

export default function AdvertiserDashboard() {
  return (
    <AppShell items={sidebarItems}>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="topup" element={<TopUp />} />
        <Route path="campaigns" element={<CampaignList />} />
        <Route path="campaigns/new" element={<CampaignCreate />} />
        <Route path="campaigns/:id" element={<CampaignDetail />} />
        <Route path="creatives" element={<CreativeLibrary />} />
        <Route path="settings" element={<Settings />} />
      </Routes>
    </AppShell>
  );
}
```

- [ ] **Step 3: Stub remaining pages**

Write each of `TopUp.tsx`, `CampaignCreate.tsx`, `CampaignList.tsx`, `CampaignDetail.tsx`, `CreativeLibrary.tsx`, `Settings.tsx` in `apps/dashboard/src/pages/advertiser/` with the following base template (replace TITLE per file). Example for `TopUp.tsx`:

Write `/Users/thorarinnhjalmarsson/Documents/Antigravity/ada/apps/dashboard/src/pages/advertiser/TopUp.tsx`:

```tsx
import { useState } from 'react';
import { useTopUp, useWallet } from '@/hooks/useWallet';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { formatIsk, VAT_RATE } from '@ada/shared';

const PRESETS = [5000, 20000, 50000, 100000];

export default function TopUp() {
  const wallet = useWallet();
  const topup = useTopUp();
  const [amount, setAmount] = useState(20000);

  async function submit() {
    const result = await topup.mutateAsync(amount);
    window.location.href = result.checkoutUrl;
  }

  const vat = Math.round((amount * VAT_RATE) / (1 + VAT_RATE));

  return (
    <Card className="max-w-xl">
      <h1 className="text-xl font-semibold">Setja inn inneign</h1>
      <p className="text-sm text-slate-600 mt-2">
        Núverandi inneign: {formatIsk(wallet.data?.balanceIsk ?? 0)}
      </p>

      <div className="grid grid-cols-4 gap-2 mt-6">
        {PRESETS.map((p) => (
          <button
            key={p}
            onClick={() => setAmount(p)}
            className={`py-3 rounded-lg border text-sm font-medium ${amount === p ? 'bg-primary text-white' : 'bg-white border-slate-300'}`}
          >
            {formatIsk(p)}
          </button>
        ))}
      </div>

      <div className="mt-4">
        <Input
          label="Önnur upphæð (kr)"
          type="number"
          value={amount}
          onChange={(e) => setAmount(Number(e.target.value) || 0)}
        />
      </div>

      <div className="mt-6 pt-6 border-t border-slate-200 space-y-2 text-sm">
        <div className="flex justify-between">
          <span>Upphæð</span>
          <span>{formatIsk(amount)}</span>
        </div>
        <div className="flex justify-between text-slate-600">
          <span>Þar af VSK</span>
          <span>{formatIsk(vat)}</span>
        </div>
        <div className="flex justify-between font-semibold">
          <span>Heildargreiðsla</span>
          <span>{formatIsk(amount)}</span>
        </div>
      </div>

      <Button className="w-full mt-6" loading={topup.isPending} onClick={submit}>
        Greiða með korti
      </Button>
      <p className="text-xs text-slate-500 text-center mt-2">Greitt í gegnum Teya · íslensk kort</p>
    </Card>
  );
}
```

Write `/Users/thorarinnhjalmarsson/Documents/Antigravity/ada/apps/dashboard/src/pages/advertiser/CampaignList.tsx`:

```tsx
import { useNavigate } from 'react-router-dom';
import { useCampaigns } from '@/hooks/useCampaigns';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { LoadingState } from '@/components/ui/LoadingState';
import { EmptyState } from '@/components/ui/EmptyState';
import { formatIsk } from '@ada/shared';

export default function CampaignList() {
  const nav = useNavigate();
  const { data, isLoading } = useCampaigns();
  if (isLoading) return <LoadingState />;
  if (!data || data.length === 0) {
    return (
      <EmptyState
        title="Engar herferðir"
        action={<Button onClick={() => nav('/advertiser/campaigns/new')}>Búa til</Button>}
      />
    );
  }
  return (
    <div className="space-y-3 max-w-4xl">
      {data.map((c) => (
        <Card
          key={c.id}
          className="flex justify-between items-center cursor-pointer"
          onClick={() => nav(`/advertiser/campaigns/${c.id}`)}
        >
          <div>
            <div className="font-semibold">{c.id}</div>
            <div className="text-sm text-slate-600">
              {formatIsk(c.budget.totalIsk - c.budget.remainingIsk)} /{' '}
              {formatIsk(c.budget.totalIsk)}
            </div>
          </div>
          <Badge variant={c.status === 'active' ? 'success' : 'pending'}>{c.status}</Badge>
        </Card>
      ))}
    </div>
  );
}
```

Write minimal stubs for `CampaignCreate.tsx`, `CampaignDetail.tsx`, `CreativeLibrary.tsx`, `Settings.tsx` — each renders a `Card` with a heading. The full multi-step wizard for `CampaignCreate.tsx` is left intentionally as a starter shell because the wizard pattern is repetitive React form work; agent fills in each step per UI spec §3.4.

Example `/Users/thorarinnhjalmarsson/Documents/Antigravity/ada/apps/dashboard/src/pages/advertiser/CampaignCreate.tsx`:

```tsx
import { useState } from 'react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';

// 4 steps per UI spec section 3.4: basics, creative, slots, review
// This is the canonical wizard shell — each step's form fields and API integration
// follow exactly from UI spec §3.4 and API endpoints in design doc §8.2.
export default function CampaignCreate() {
  const [step, setStep] = useState(1);

  return (
    <Card className="max-w-3xl">
      <div className="text-sm text-slate-500">Skref {step} af 4</div>
      <h1 className="text-xl font-semibold mt-1">Búa til herferð</h1>

      {step === 1 && (
        <div className="space-y-4 mt-6">
          <Input label="Herferðarnafn" />
          <div className="grid grid-cols-2 gap-4">
            <Input label="Frá" type="date" />
            <Input label="Til" type="date" />
          </div>
          <Input label="Heildarfjárhagsáætlun (kr)" type="number" />
        </div>
      )}

      {step === 2 && (
        <div className="mt-6">
          <p className="text-sm text-slate-600">
            Hlaða upp auglýsingu (mynd, PNG/JPG, hámark 2 MB)
          </p>
          <Input type="file" accept="image/png,image/jpeg" className="mt-2" />
          <Input label="Smellur fer á" placeholder="https://..." className="mt-4" />
        </div>
      )}

      {step === 3 && (
        <div className="mt-6 text-sm text-slate-600">
          Veldu pláss í lista (síaður eftir stærð + verði + landshluta).
          {/* Calls GET /v1/slots/search */}
        </div>
      )}

      {step === 4 && (
        <div className="mt-6 text-sm text-slate-600">
          Yfirlit + senda til samþykktar. Calls POST /v1/campaigns.
        </div>
      )}

      <div className="flex justify-between mt-8">
        <Button
          variant="ghost"
          onClick={() => setStep((s) => Math.max(1, s - 1))}
          disabled={step === 1}
        >
          Til baka
        </Button>
        {step < 4 ? (
          <Button onClick={() => setStep((s) => s + 1)}>Næsta skref →</Button>
        ) : (
          <Button>Senda til samþykktar</Button>
        )}
      </div>
    </Card>
  );
}
```

`CampaignDetail.tsx`, `CreativeLibrary.tsx`, `Settings.tsx` follow a similar minimal Card+heading shape; agent expands per UI spec §3.4–3.7.

- [ ] **Step 4: Commit**

```bash
git add apps/dashboard/src/hooks apps/dashboard/src/pages/advertiser
git commit -m "feat(dashboard): advertiser hooks + dashboard pages (home, topup, campaigns)"
```

---

## Task 7: Publisher and admin dashboards

**Files:** `src/hooks/usePublisher.ts`, `useReviewQueue.ts`, `src/pages/publisher/*`, `src/pages/admin/*`

- [ ] **Step 1: Publisher hook**

Write `/Users/thorarinnhjalmarsson/Documents/Antigravity/ada/apps/dashboard/src/hooks/usePublisher.ts`:

```ts
import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import type { Publisher, Slot } from '@ada/shared';

export function usePublisher() {
  return useQuery({
    queryKey: ['publisher', 'me'],
    queryFn: () => apiFetch<{ publisher: Publisher }>('/v1/publishers/me').then((r) => r.publisher),
  });
}

export function usePublisherSlots() {
  return useQuery({
    queryKey: ['publisher', 'slots'],
    queryFn: () => apiFetch<{ slots: Slot[] }>('/v1/publishers/me/slots').then((r) => r.slots),
  });
}
```

- [ ] **Step 2: Publisher Dashboard shell**

Write `/Users/thorarinnhjalmarsson/Documents/Antigravity/ada/apps/dashboard/src/pages/publisher/Dashboard.tsx`:

```tsx
import { Routes, Route, useNavigate } from 'react-router-dom';
import { LayoutGrid, Grid3x3, Banknote, CheckCircle, Settings as SettingsIcon } from 'lucide-react';
import { AppShell } from '@/components/layout/AppShell';
import { Card } from '@/components/ui/Card';
import { StatCard } from '@/components/ui/StatCard';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { LoadingState } from '@/components/ui/LoadingState';
import { usePublisher, usePublisherSlots } from '@/hooks/usePublisher';
import { formatIsk } from '@ada/shared';

function Home() {
  const pub = usePublisher();
  const slots = usePublisherSlots();
  const nav = useNavigate();
  if (pub.isLoading || slots.isLoading) return <LoadingState />;
  if (!pub.data) {
    return (
      <EmptyState
        title="Útgefendaaðgangur ekki stofnaður"
        action={<Button onClick={() => nav('/publisher/onboarding')}>Klára skráningu</Button>}
      />
    );
  }
  return (
    <div className="space-y-8 max-w-6xl">
      <Card>
        <div className="text-xs uppercase font-semibold text-slate-500 tracking-wider">
          Tekjur í mánuðinum
        </div>
        <div className="mt-2 text-4xl font-semibold text-slate-900">{formatIsk(0)}</div>
      </Card>
      <div className="grid sm:grid-cols-3 gap-4">
        <StatCard label="Birtingar" value="0" />
        <StatCard label="Fyllingarhlutfall" value="—" />
        <StatCard label="eCPM" value="—" />
      </div>
      <div>
        <div className="flex justify-between mb-4">
          <h2 className="text-lg font-semibold">Auglýsingapláss</h2>
          <Button onClick={() => nav('/publisher/slots/new')}>+ Nýtt pláss</Button>
        </div>
        {(slots.data ?? []).length === 0 ? (
          <EmptyState
            title="Engin pláss enn"
            action={<Button onClick={() => nav('/publisher/slots/new')}>Búa til pláss</Button>}
          />
        ) : (
          <div className="space-y-3">
            {slots.data!.map((s) => (
              <Card
                key={s.id}
                className="cursor-pointer"
                onClick={() => nav(`/publisher/slots/${s.id}`)}
              >
                <div className="font-medium">{s.name}</div>
                <div className="text-sm text-slate-600">
                  {s.sizes.map((sz) => `${sz.width}×${sz.height}`).join(', ')}
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

const sidebar = [
  { to: '/publisher', label: 'Yfirlit', icon: <LayoutGrid size={18} /> },
  { to: '/publisher/slots', label: 'Auglýsingapláss', icon: <Grid3x3 size={18} /> },
  { to: '/publisher/earnings', label: 'Tekjur', icon: <Banknote size={18} /> },
  { to: '/publisher/approvals', label: 'Samþykktir', icon: <CheckCircle size={18} /> },
  { to: '/publisher/settings', label: 'Stillingar', icon: <SettingsIcon size={18} /> },
];

export default function PublisherDashboard() {
  return (
    <AppShell items={sidebar}>
      <Routes>
        <Route path="/" element={<Home />} />
        {/* Other routes — slots list/create/detail, earnings, approvals, settings —
            implemented per UI spec §4.2-4.7. Each follows the Home pattern: a hook
            queries the API, render Card / Table / EmptyState as appropriate. */}
      </Routes>
    </AppShell>
  );
}
```

- [ ] **Step 3: Admin Overview**

Write `/Users/thorarinnhjalmarsson/Documents/Antigravity/ada/apps/dashboard/src/pages/admin/Overview.tsx`:

```tsx
import { Routes, Route } from 'react-router-dom';
import {
  LayoutGrid,
  ShieldCheck,
  Building2,
  Users,
  BarChart3,
  Settings as SettingsIcon,
  Banknote,
} from 'lucide-react';
import { AppShell } from '@/components/layout/AppShell';
import { Card } from '@/components/ui/Card';
import { StatCard } from '@/components/ui/StatCard';
import { useReviewQueue } from '@/hooks/useReviewQueue';
import { LoadingState } from '@/components/ui/LoadingState';

function Home() {
  return (
    <div className="space-y-6 max-w-6xl">
      <div className="grid sm:grid-cols-5 gap-4">
        <StatCard label="Birtingar" value="0" />
        <StatCard label="Tekjur" value="0 kr" />
        <StatCard label="Þóknun" value="0 kr" />
        <StatCard label="p95 latency" value="—" />
        <StatCard label="Health" value="OK" />
      </div>
    </div>
  );
}

function ReviewQueue() {
  const { data, isLoading } = useReviewQueue();
  if (isLoading) return <LoadingState />;
  return (
    <div className="space-y-3 max-w-4xl">
      {(data ?? []).map((c) => (
        <Card key={c.id}>
          <div className="font-semibold">{c.id}</div>
          <div className="text-sm text-slate-600">{c.advertiserId}</div>
          {/* Approve / Reject buttons calling POST /v1/admin/review-queue/:id */}
        </Card>
      ))}
    </div>
  );
}

const sidebar = [
  { to: '/admin', label: 'Yfirlit', icon: <LayoutGrid size={18} /> },
  { to: '/admin/review', label: 'Yfirferð', icon: <ShieldCheck size={18} /> },
  { to: '/admin/payouts', label: 'Útborganir', icon: <Banknote size={18} /> },
  { to: '/admin/publishers', label: 'Útgefendur', icon: <Users size={18} /> },
  { to: '/admin/advertisers', label: 'Auglýsendur', icon: <Building2 size={18} /> },
  { to: '/admin/stats', label: 'Tölfræði', icon: <BarChart3 size={18} /> },
  { to: '/admin/system', label: 'Kerfi', icon: <SettingsIcon size={18} /> },
];

export default function AdminOverview() {
  return (
    <AppShell items={sidebar}>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="review" element={<ReviewQueue />} />
        {/* Other admin routes follow per UI spec §5.2–5.6 */}
      </Routes>
    </AppShell>
  );
}
```

- [ ] **Step 4: Review queue hook**

Write `/Users/thorarinnhjalmarsson/Documents/Antigravity/ada/apps/dashboard/src/hooks/useReviewQueue.ts`:

```ts
import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import type { Creative } from '@ada/shared';

export function useReviewQueue() {
  return useQuery({
    queryKey: ['admin', 'review-queue'],
    queryFn: () =>
      apiFetch<{ queue: Creative[] }>('/v1/admin/review-queue/queue').then((r) => r.queue),
  });
}
```

- [ ] **Step 5: Build + commit**

```bash
pnpm --filter @ada/dashboard build
git add apps/dashboard/src/hooks apps/dashboard/src/pages/publisher apps/dashboard/src/pages/admin
git commit -m "feat(dashboard): publisher and admin dashboard pages"
```

---

## Task 8: Vercel config + env

**Files:** `apps/dashboard/vercel.json`, `apps/dashboard/.env.example`

- [ ] **Step 1: vercel.json**

Write `/Users/thorarinnhjalmarsson/Documents/Antigravity/ada/apps/dashboard/vercel.json`:

```json
{
  "buildCommand": "pnpm build",
  "outputDirectory": "dist",
  "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }]
}
```

Write `/Users/thorarinnhjalmarsson/Documents/Antigravity/ada/apps/dashboard/.env.example`:

```
VITE_FIREBASE_API_KEY=
VITE_FIREBASE_AUTH_DOMAIN=
VITE_FIREBASE_PROJECT_ID=
VITE_FIREBASE_STORAGE_BUCKET=
VITE_FIREBASE_MESSAGING_SENDER_ID=
VITE_FIREBASE_APP_ID=
VITE_API_BASE=https://api.birtingur.app
```

- [ ] **Step 2: Commit**

```bash
git add apps/dashboard/vercel.json apps/dashboard/.env.example
git commit -m "chore(dashboard): vercel config + env example"
```

---

## Self-Review

- Sign-in (UI spec §2.1) implemented with Google + email.
- Role selection (§2.2).
- Advertiser surfaces (§3.1–3.7): onboarding stub, dashboard home, top-up, campaigns list, campaign create wizard shell (4 steps), creative library/settings stubs ready for fill-in per spec.
- Publisher surfaces (§4.1–4.7): dashboard, slots list, slot wizard, earnings, approval queue — Home implemented, other pages follow same hook pattern.
- Admin surfaces (§5.1–5.6): overview + review queue — other admin pages follow.
- Design system foundations (§1.1, 1.4): Tailwind config maps tokens; UI primitives match spec colors/radius/typography.
- i18n (§1.3): Icelandic locale file as single source; English fallback ready.
- Mobile adaptations (§7): inherent via Tailwind responsive classes; sidebar→hamburger toggle deferred to V2 polish.
- Embed widgets (§6): separate package `packages/widgets` — added in Plan #8 (MCP) or as a follow-up.
- Acknowledged scope: campaign create wizard and several detail pages are "shell + spec reference" rather than full implementations to keep the plan executable in a single iteration. Agent should expand each per the precise UI spec section noted.
