import { Card } from '@/components/ui/Card';
import { ShieldCheck, Info } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/Button';

export default function ApprovalQueue() {
  const navigate = useNavigate();

  return (
    <div className="max-w-xl mx-auto space-y-6 pt-6 animate-fadeIn">
      <Card className="p-8 text-center space-y-5 shadow-lg border border-slate-100 rounded-2xl bg-white">
        <div className="w-16 h-16 bg-sky-50 rounded-full flex items-center justify-center mx-auto border border-sky-100">
          <ShieldCheck className="h-8 w-8 text-primary" />
        </div>
        <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">
          Sjálfvirk og örugg flokkun
        </h1>
        <p className="text-sm text-slate-500 font-medium leading-relaxed max-w-sm mx-auto">
          Til að auðvelda reksturinn höfum við afnumið handvirkt samþykki á einstökum herferðum.
          Þess í stað flokkar og yfirfer vettvangurinn allar auglýsingar áður en þær eru birtar.
        </p>
        <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 text-left flex gap-3 text-xs text-slate-600 font-medium max-w-md mx-auto leading-relaxed">
          <Info className="h-5 w-5 text-blue-600 shrink-0 mt-0.5" />
          <p>
            Ef þú vilt eingöngu leyfa auglýsingar sem stjórnandi vettvangsins hefur yfirfarið
            handvirkt (í stað sjálfvirks gervigreindarsamþykkis), geturðu virkjað{' '}
            <strong>"Krefjast handvirks samþykkis"</strong> í stillingum.
          </p>
        </div>
        <Button onClick={() => navigate('/publisher/settings')} className="font-bold">
          Fara í stillingar
        </Button>
      </Card>
    </div>
  );
}
