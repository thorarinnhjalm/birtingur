import { StatCard } from '@ada/dashboard';

const grid = {
  display: 'grid',
  gridTemplateColumns: 'repeat(2, minmax(180px, 1fr))',
  gap: 16,
  maxWidth: 520,
};

// Ported from the admin Overview dashboard — platform health stats.
export const Overview = () => (
  <div style={grid}>
    <StatCard label="Birtingar (allur tími)" value="1.248.302" />
    <StatCard label="Velta (allur tími)" value="2.145.000 kr." />
    <StatCard label="Svartími (p95)" value="24 ms" />
    <StatCard label="Kerfisheilsa" value="OK" />
  </div>
);

export const WithDeltas = () => (
  <div style={grid}>
    <StatCard
      label="Birtingar í dag"
      value="48.211"
      delta={{ value: '+12,4% frá í gær', positive: true }}
    />
    <StatCard
      label="Smellir í dag"
      value="392"
      delta={{ value: '-3,1% frá í gær', positive: false }}
    />
  </div>
);

export const Single = () => (
  <div style={{ maxWidth: 240 }}>
    <StatCard
      label="Tekjur útgefanda"
      value="86.400 kr."
      delta={{ value: '+8,2%', positive: true }}
    />
  </div>
);
