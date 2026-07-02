import { Card, Button, Badge } from '@ada/dashboard';

// Ported from the advertiser TopUp page — wallet balance summary card.
export const WalletSummary = () => (
  <Card style={{ maxWidth: 480 }}>
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        borderBottom: '1px solid #f1f5f9',
        paddingBottom: 16,
        marginBottom: 16,
      }}
    >
      <span className="text-sm font-semibold text-slate-500">Núverandi inneign:</span>
      <span className="text-lg font-bold text-slate-900">124.500 kr.</span>
    </div>
    <p className="text-sm text-slate-600">
      Inneignin er notuð til að greiða fyrir birtingar herferða þinna. Bættu við inneign með korti
      eða millifærslu.
    </p>
    <div style={{ marginTop: 16 }}>
      <Button>Bæta við inneign</Button>
    </div>
  </Card>
);

// Ported from the advertiser Settings page — card wrapping a section header + body.
export const SectionCard = () => (
  <Card style={{ maxWidth: 480 }}>
    <h3 className="text-base font-bold text-slate-900 mb-1">Auglýsingapláss</h3>
    <p className="text-slate-500 text-sm font-medium mb-4">
      Yfirlit yfir virk pláss á vefnum þínum.
    </p>
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span className="text-sm text-slate-700">Haus — 728×90</span>
        <Badge variant="success">Virkt</Badge>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span className="text-sm text-slate-700">Hliðarstika — 300×250</span>
        <Badge variant="pending">Í bið</Badge>
      </div>
    </div>
  </Card>
);

export const PlainContent = () => (
  <Card style={{ maxWidth: 400 }}>
    <p className="text-sm text-slate-700">
      Herferðin „Sumartilboð matur“ er í gangi og hefur náð 48.211 birtingum í flokknum matur.
    </p>
  </Card>
);
