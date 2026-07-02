import { PublicHeader } from '@ada/dashboard';

// Marketing-site header (birtingur.app): logo + brand, pill nav
// (Yfirlit / Fyrir auglýsendur / Fyrir útgefendur / FAQ), sign-in CTAs.
// Logged out via DSProvider, so the Skrá inn / Hefja auglýsingar pair shows.

// zoom: the header's desktop layout needs ~950px; the capture viewport is
// 900 (852 after card padding). A slight zoom frames the full row — the
// durable fix is a wider viewport override for this card (see learnings).
export const Default = () => (
  <div style={{ width: '100%', zoom: 0.75 }}>
    <PublicHeader />
  </div>
);

// Advertiser tab active + a local-region badge, as rendered on the
// /auglysendur/<region> landing pages.
export const AdvertiserTabWithRegion = () => (
  <div style={{ width: '100%', zoom: 0.68 }}>
    <PublicHeader
      currentTab="advertisers"
      activeRegion={{
        name: 'Akureyri',
        dative: 'Akureyri',
        genitive: 'Akureyrar',
        parentName: 'Norðurland',
        regionLabel: 'Norðurland eystra',
      }}
    />
  </div>
);
