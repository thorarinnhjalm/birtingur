import { PublicFooter } from '@ada/dashboard';

// Marketing-site footer: company info (Neðri Hóll Hugmyndahús ehf.),
// advertiser/publisher link columns, service links, regional-ads links,
// and the copyright/terms bar. The mt-16 on the footer is part of the
// component; the wrapper just gives it page width.

export const Default = () => (
  <div style={{ width: '100%', minWidth: 820, marginTop: -64 }}>
    <PublicFooter />
  </div>
);
