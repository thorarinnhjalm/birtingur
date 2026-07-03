import { PillButton } from '@ada/dashboard';

export const Presets = () => (
  <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
    <PillButton>25.000 kr.</PillButton>
    <PillButton active>50.000 kr.</PillButton>
    <PillButton>100.000 kr.</PillButton>
    <PillButton>200.000 kr.</PillButton>
  </div>
);

export const Filters = () => (
  <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
    <PillButton active>Allar</PillButton>
    <PillButton>Virkar</PillButton>
    <PillButton>Í yfirferð</PillButton>
    <PillButton>Lokið</PillButton>
  </div>
);
