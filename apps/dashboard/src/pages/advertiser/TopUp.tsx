import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTopUp, useWallet } from '@/hooks/useWallet';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { formatIsk } from '@/lib/format';
import { VAT_RATE } from '@ada/shared';
import { AlertCircle, CreditCard, ShieldCheck, CheckCircle, AlertTriangle } from 'lucide-react';

const PRESETS = [5000, 20000, 50000, 100000];

export default function TopUp() {
  const wallet = useWallet();
  const topup = useTopUp();
  const [searchParams] = useSearchParams();
  const success = searchParams.get('success') === 'true';
  const cancelled = searchParams.get('cancelled') === 'true';

  const [amount, setAmount] = useState(20000);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setError(null);
    if (amount < 2000) {
      setError('Lágmarksinnborgun er 2.000 kr.');
      return;
    }
    try {
      const result = await topup.mutateAsync(amount);
      if (result.checkoutUrl) {
        window.location.href = result.checkoutUrl;
      } else {
        throw new Error('Engin greiðsluslóð fannst.');
      }
    } catch (err: any) {
      setError(err.message || 'Ekki tókst að hefja greiðsluferli. Reyndu aftur síðar.');
    }
  }

  // Under consignment model, the deposit itself is VAT-free.
  // VAT is calculated only on the 20% platform brokerage fee.
  const platformFee = Math.round(amount * 0.2);
  const platformFeeVat = Math.round(platformFee * VAT_RATE);

  return (
    <div className="max-w-xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Setja inn inneign</h1>
        <p className="text-slate-500 text-sm font-medium mt-1">
          Bættu inneign á auglýsendaaðganginn þinn til að halda herferðum gangandi.
        </p>
      </div>

      {success && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800 flex items-start gap-3 shadow-sm">
          <CheckCircle className="text-emerald-500 shrink-0 mt-0.5" size={18} />
          <div>
            <h4 className="font-bold text-emerald-900 text-sm">Innborgun tókst!</h4>
            <p className="text-emerald-700 text-xs font-medium mt-0.5">
              Greiðslan hefur verið staðfest og inneignin hefur verið uppfærð á aðgangi þínum.
            </p>
          </div>
        </div>
      )}

      {cancelled && (
        <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl text-amber-800 flex items-start gap-3 shadow-sm">
          <AlertTriangle className="text-amber-500 shrink-0 mt-0.5" size={18} />
          <div>
            <h4 className="font-bold text-amber-900 text-sm">Hætt við greiðslu</h4>
            <p className="text-amber-700 text-xs font-medium mt-0.5">
              Hætt var við greiðsluferlið. Engir peningar voru dregnir af kortinu þínu.
            </p>
          </div>
        </div>
      )}

      <Card className="p-6">
        <div className="flex justify-between items-center mb-6 border-b border-slate-100 pb-4">
          <span className="text-sm font-semibold text-slate-500">Núverandi inneign:</span>
          <span className="text-lg font-bold text-slate-900">
            {wallet.isLoading ? 'Hleður...' : formatIsk(wallet.data?.balanceIsk ?? 0)}
          </span>
        </div>

        <div>
          <span className="block text-sm font-medium text-slate-700 mb-2">Veldu upphæð</span>
          <div className="grid grid-cols-4 gap-2">
            {PRESETS.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => {
                  setAmount(p);
                  setError(null);
                }}
                className={`py-3 rounded-lg border text-sm font-bold transition-all cursor-pointer ${
                  amount === p
                    ? 'bg-primary border-primary text-white shadow-[0_2px_4px_rgba(30,58,138,0.15)]'
                    : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50 hover:border-slate-300'
                }`}
              >
                {formatIsk(p)}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-4">
          <Input
            label="Önnur upphæð (kr)"
            type="number"
            min="2000"
            step="1000"
            value={amount || ''}
            onChange={(e) => {
              setAmount(Number(e.target.value) || 0);
              setError(null);
            }}
          />
        </div>

        {/* Pricing breakdown */}
        <div className="mt-6 pt-6 border-t border-slate-200 space-y-3 text-sm">
          <div className="flex justify-between text-slate-600 font-medium">
            <span>Innlögn á veltureikning (VSK-frítt)</span>
            <span>{formatIsk(amount)}</span>
          </div>
          <div className="flex justify-between text-slate-500 font-medium text-xs pl-2 border-l-2 border-slate-200">
            <span>Áætluð þóknun Birtingar (20%)</span>
            <span>{formatIsk(platformFee)}</span>
          </div>
          <div className="flex justify-between text-slate-500 font-medium text-xs pl-2 border-l-2 border-slate-200">
            <span>Áætlaður VSK af þóknun (24%)</span>
            <span>{formatIsk(platformFeeVat)}</span>
          </div>
          <div className="flex justify-between text-slate-900 font-extrabold text-base border-t border-slate-100 pt-3">
            <span>Heildargreiðsla</span>
            <span>{formatIsk(amount)}</span>
          </div>
          <p className="text-[10px] text-slate-400 font-medium leading-relaxed mt-2">
            * Samkvæmt lögum um umboðssölu er innlögnin sjálf VSK-frjáls innlögn á veltureikning.
            Virðisaukaskattur (24%) reiknast eingöngu af þjónustuþóknun Birtingar (20%) þegar
            auglýsingar eru sýndar.
          </p>
        </div>

        {error && (
          <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg text-xs font-semibold text-red-600 flex items-center gap-2">
            <AlertCircle size={14} className="shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <Button
          className="w-full mt-6 justify-center gap-2 font-bold py-3.5 shadow-md shadow-primary/10 cursor-pointer"
          loading={topup.isPending}
          onClick={submit}
        >
          <CreditCard size={16} />
          <span>Greiða með korti</span>
        </Button>

        <div className="flex items-center justify-center gap-1.5 mt-4 text-xs text-slate-400 font-medium">
          <ShieldCheck size={14} className="text-slate-300" />
          <span>Örugg greiðslugátt keyrð af Teya · Stuðningur við öll helstu kort</span>
        </div>
      </Card>
    </div>
  );
}
