import type { ReactNode } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from '../apps/dashboard/src/lib/auth-context';

// Preview wrapper for design-sync: layout components (TopBar, Sidebar,
// PublicHeader, ...) read router + auth + react-query context. Firebase
// initializes with its mock-config fallbacks under the preview bundle's
// stubbed import.meta.env, so AuthProvider renders the logged-out state.
// retry: false — API fetches to localhost fail in cards; fail fast so
// components settle into their empty-data state before capture.
const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false } },
});

export function DSProvider({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <AuthProvider>{children}</AuthProvider>
      </MemoryRouter>
    </QueryClientProvider>
  );
}
