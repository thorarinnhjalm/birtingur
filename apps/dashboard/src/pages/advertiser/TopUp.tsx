import { useState } from 'react';
import { useTopUp, useWallet } from '@/hooks/useWallet';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { formatIsk } from '@/lib/format';
import { VAT_RATE } from '@ada/shared';
import { AlertCircle, CreditCard, ShieldCheck } from 'lucide-react';

const PRESETS = [5000, 20000, 50000, 100000];

export default function TopUp() {
  const wallet = useWallet();
  const topup = useTopUp();
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

  // Calculate VAT included in the total amount
  const vat = Math.round((amount * VAT_RATE) / (1 + VAT_RATE));
  const subtotal = amount - vat;

  return (
    <div className="max-w-xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Setja inn inneign</h1>
        <p className="text-slate-500 text-sm font-medium mt-1">
          Bættu inneign á auglýsendaaðganginn þinn til að halda herferðum gangandi.
        </p>
      </div>

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
            <span>Upphæð (án VSK)</span>
            <span>{formatIsk(subtotal)}</span>
          </div>
          <div className="flex justify-between text-slate-500 font-medium">
            <span>VSK (24% innifalinn)</span>
            <span>{formatIsk(vat)}</span>
          </div>
          <div className="flex justify-between text-slate-900 font-extrabold text-base border-t border-slate-100 pt-3">
            <span>Heildargreiðsla</span>
            <span>{formatIsk(amount)}</span>
          </div>
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
