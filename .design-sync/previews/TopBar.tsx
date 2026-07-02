import { TopBar } from '@ada/dashboard';

// The app's dashboard header: search field, workspace switcher
// (Auglýsandi/Útgefandi), notifications bell, user chip, logout.
// Auth comes from DSProvider (logged-out user → 'Notandi'); notifications
// fetch fails in the card and should degrade to the empty state.
// NOTE: TopBar calls useNotifications (TanStack Query) — it needs a
// QueryClientProvider from inside the bundle's module graph (DSProvider).

export const Default = () => (
  <div style={{ width: '100%', minWidth: 820 }}>
    <TopBar />
  </div>
);
