import { AppShell } from '@ada/dashboard';

// Full dashboard chrome: fixed Sidebar + TopBar + content column, composed
// the way pages/publisher/Dashboard.tsx does. Content is simple stat cards
// so the shell (not the page) is what's being judged.
// NOTE: AppShell renders TopBar → useNotifications (TanStack Query), so it
// needs a QueryClientProvider inside the bundle (DSProvider).

const sidebarItems = [
  { to: '/', label: 'Yfirlit', icon: 'dashboard' },
  { to: '/publisher/slots', label: 'Auglýsingapláss', icon: 'grid_view' },
  { to: '/publisher/earnings', label: 'Tekjur', icon: 'payments' },
];

const stats = [
  { label: 'Birtingar í dag', value: '12.480' },
  { label: 'Smellir', value: '184' },
  { label: 'Tekjur í mánuðinum', value: '48.350 kr.' },
];

export const PublisherDashboard = () => (
  <div
    style={{ position: 'relative', width: '100%', minWidth: 1100, height: 700, overflow: 'hidden' }}
  >
    <AppShell items={sidebarItems} title="Birtingur Útgefandi">
      <h2 style={{ fontSize: 22, fontWeight: 800, margin: '0 0 16px' }}>Yfirlit</h2>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
        {stats.map((s) => (
          <div
            key={s.label}
            style={{
              background: '#fff',
              border: '1px solid #e2e8f0',
              borderRadius: 12,
              padding: 20,
            }}
          >
            <div
              style={{
                fontSize: 11,
                fontWeight: 700,
                textTransform: 'uppercase',
                color: '#64748b',
                letterSpacing: '0.05em',
              }}
            >
              {s.label}
            </div>
            <div style={{ fontSize: 26, fontWeight: 800, marginTop: 8, color: '#0f172a' }}>
              {s.value}
            </div>
          </div>
        ))}
      </div>
    </AppShell>
  </div>
);
