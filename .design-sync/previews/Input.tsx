import { Input } from '@ada/dashboard';

const col = { display: 'flex', flexDirection: 'column' as const, gap: 16, maxWidth: 380 };

// Ported from advertiser Settings — labelled fields as used in the app's forms.
export const WithLabel = () => (
  <div style={col}>
    <Input label="Fyrirtækisnafn" defaultValue="Kaffihúsið Mokka ehf." />
    <Input label="Netfang fyrir reikninga" type="email" placeholder="bokhald@fyrirtaeki.is" />
  </div>
);

export const ErrorField = () => (
  <div style={col}>
    <Input
      label="VSK-númer"
      defaultValue="12345"
      error="VSK-númer verður að vera 5–6 tölustafir og skráð hjá RSK."
    />
  </div>
);

export const DisabledField = () => (
  <div style={col}>
    <Input label="Kennitala (Ekki hægt að breyta)" defaultValue="571298-2349" disabled />
  </div>
);

export const BareInput = () => (
  <div style={col}>
    <Input placeholder="Leita að herferð..." />
  </div>
);
