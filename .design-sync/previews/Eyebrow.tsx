import { Eyebrow } from '@ada/dashboard';

export const Default = () => <Eyebrow>Ný herferð</Eyebrow>;

export const AboveHeading = () => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
    <Eyebrow>Svona virkar það</Eyebrow>
    <span style={{ fontSize: 24, fontWeight: 800, letterSpacing: '-0.02em' }}>
      Frá hugmynd að birtingu
    </span>
  </div>
);
