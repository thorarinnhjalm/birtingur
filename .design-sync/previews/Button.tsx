import { Button } from '@ada/dashboard';

export const Variants = () => (
  <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
    <Button>Stofna herferð</Button>
    <Button variant="secondary">Skoða nánar</Button>
    <Button variant="ghost">Hætta við</Button>
    <Button variant="danger">Eyða plássi</Button>
  </div>
);

export const States = () => (
  <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
    <Button disabled>Óvirkur hnappur</Button>
    <Button loading>Vista breytingar</Button>
  </div>
);
