import { Logo } from '@ada/dashboard';

// Birtingur mark at the sizes the app actually uses (footer 32, sidebar 36, header 40).
export const Sizes = () => (
  <div
    style={{
      display: 'flex',
      alignItems: 'flex-end',
      gap: 32,
      padding: 24,
      background: '#ffffff',
      borderRadius: 12,
    }}
  >
    <Logo size={24} />
    <Logo size={40} />
    <Logo size={64} />
  </div>
);

// Sidebar lockup: mark + wordmark, as in components/layout/Sidebar.tsx.
export const SidebarLockup = () => (
  <div
    style={{
      display: 'flex',
      alignItems: 'center',
      gap: 12,
      padding: '16px 20px',
      background: '#f8fafc',
      border: '1px solid #e2e8f0',
      borderRadius: 12,
      width: 260,
    }}
  >
    <Logo size={36} className="shadow-md rounded-lg" />
    <div>
      <div style={{ fontSize: 18, fontWeight: 700, color: '#1e3a8a', lineHeight: 1.2 }}>
        Auglýsandi
      </div>
      <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>Birtingur.app</div>
    </div>
  </div>
);
