import { Sidebar } from '@ada/dashboard';

// Nav items harvested from pages/publisher/Dashboard.tsx and
// pages/advertiser/Dashboard.tsx. The DSProvider MemoryRouter sits at '/',
// so the first item uses to='/' to exercise the active-item styling
// (NavLink to='/' matches exactly at the router's initial location).
// The sidebar is `fixed h-screen`; the sized wrapper (with transform via the
// card's .ds-cell/.ds-single containment) keeps it framed in the shot.

const publisherItems = [
  { to: '/', label: 'Yfirlit', icon: 'dashboard' },
  { to: '/publisher/slots', label: 'Auglýsingapláss', icon: 'grid_view' },
  { to: '/publisher/earnings', label: 'Tekjur', icon: 'payments' },
];

const advertiserItems = [
  { to: '/', label: 'Mælaborð', icon: 'dashboard' },
  { to: '/advertiser/campaigns', label: 'Herferðir', icon: 'campaign' },
  { to: '/advertiser/creatives', label: 'Auglýsingasafn', icon: 'collections' },
  { to: '/advertiser/topup', label: 'Greiðslur', icon: 'payments' },
];

export const PublisherNav = () => (
  <div style={{ position: 'relative', width: 300, height: 640, overflow: 'hidden' }}>
    <Sidebar items={publisherItems} title="Birtingur Útgefandi" />
  </div>
);

export const AdvertiserNav = () => (
  <div style={{ position: 'relative', width: 300, height: 640, overflow: 'hidden' }}>
    <Sidebar items={advertiserItems} title="Birtingur Auglýsandi" />
  </div>
);
