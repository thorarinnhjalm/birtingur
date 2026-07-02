import { Badge } from '@ada/dashboard';

// Status labels as used across slot/campaign tables in the app.
export const Variants = () => (
  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
    <Badge variant="success">Virk</Badge>
    <Badge variant="pending">Í bið</Badge>
    <Badge variant="danger">Hafnað</Badge>
    <Badge variant="info">Í yfirferð</Badge>
    <Badge variant="neutral">Drög</Badge>
  </div>
);

export const InContext = () => (
  <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
    <span style={{ fontWeight: 600 }}>matarbloggid.is</span>
    <Badge variant="success">Virk</Badge>
  </div>
);
