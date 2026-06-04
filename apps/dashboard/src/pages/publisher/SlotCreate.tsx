import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCreateSlot } from '@/hooks/usePublisher';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { IAB_STANDARD_SIZES, FLAT_CPM_ISK } from '@ada/shared';
import { ShieldCheck, Plus, Check } from 'lucide-react';

export default function SlotCreate() {
  const navigate = useNavigate();
  const createSlotMutation = useCreateSlot();

  const [name, setName] = useState('');
  const [selectedSizes, setSelectedSizes] = useState<Array<{ width: number; height: number }>>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [autoApprove, setAutoApprove] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [pricingMode, setPricingMode] = useState<'cpm' | 'slot'>('cpm');
  const [cpmIsk, setCpmIsk] = useState<string>('550');
  const [slotPriceIsk, setSlotPriceIsk] = useState<string>('50000');
  const [slotPeriodDays, setSlotPeriodDays] = useState<string>('30');

  const toggleSize = (size: { width: number; height: number }) => {
    setSelectedSizes((prev) => {
      const exists = prev.some((s) => s.width === size.width && s.height === size.height);
      if (exists) {
        return prev.filter((s) => !(s.width === size.width && s.height === size.height));
      } else {
        return [...prev, size];
      }
    });
  };

  const handleCategoryToggle = (cat: string) => {
    setCategories((prev) => (prev.includes(cat) ? prev.filter((c) => c !== cat) : [...prev, cat]));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!name.trim()) {
      setError('Heiti pláss er áskilið');
      return;
    }
    if (selectedSizes.length === 0) {
      setError('Veldu að minnsta kosti eina leyfilega stærð');
      return;
    }

    let pricing;
    if (pricingMode === 'cpm') {
      const cpmVal = parseInt(cpmIsk, 10);
      if (isNaN(cpmVal) || cpmVal <= 0) {
        setError('CPM verð verður að vera jákvæð heiltala');
        return;
      }
      pricing = {
        mode: 'cpm' as const,
        cpmIsk: cpmVal,
      };
    } else {
      const priceVal = parseInt(slotPriceIsk, 10);
      const daysVal = parseInt(slotPeriodDays, 10);
      if (isNaN(priceVal) || priceVal <= 0) {
        setError('Verð tímabils verður að vera jákvæð heiltala');
        return;
      }
      if (isNaN(daysVal) || daysVal <= 0) {
        setError('Fjöldi daga verður að vera jákvæð heiltala');
        return;
      }
      pricing = {
        mode: 'slot' as const,
        slotPriceIsk: priceVal,
        slotPeriodDays: daysVal,
      };
    }

    try {
      await createSlotMutation.mutateAsync({
        name,
        sizes: selectedSizes,
        pricing,
        targeting: {
          categories: categories.length > 0 ? categories : undefined,
        },
        autoApprove,
      });
      navigate('/publisher/slots');
    } catch (err: any) {
      setError(err.message || 'Ekki tókst að búa til auglýsingapláss.');
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Búa til auglýsingapláss</h1>
        <p className="text-slate-500 text-sm font-medium mt-1">
          Stofnaðu nýtt hólf og stilltu hvaða stærðir og áætlun gildir.
        </p>
      </div>

      <Card className="p-6">
        <form onSubmit={handleSubmit} className="space-y-6">
          <Input
            label="Heiti auglýsingapláss *"
            placeholder="Dæmi: Forsíða leaderboard efst"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            disabled={createSlotMutation.isPending}
          />

          {/* Sizes */}
          <div className="space-y-2">
            <span className="block text-sm font-medium text-slate-700">
              Leyfðar stærðir (IAB staðall) *
            </span>
            <p className="text-xs text-slate-400 font-semibold mb-3">
              Veldu allar stærðir sem hannaðar eru inn í þetta vefsvæði.
            </p>
            <div className="grid sm:grid-cols-2 gap-2">
              {IAB_STANDARD_SIZES.map((sz) => {
                const isSelected = selectedSizes.some(
                  (s) => s.width === sz.width && s.height === sz.height,
                );
                return (
                  <button
                    key={`${sz.width}x${sz.height}`}
                    type="button"
                    onClick={() => toggleSize({ width: sz.width, height: sz.height })}
                    disabled={createSlotMutation.isPending}
                    className={`p-3 border rounded-lg flex items-center justify-between text-left cursor-pointer transition-all ${
                      isSelected
                        ? 'border-primary bg-blue-50/20 ring-1 ring-primary'
                        : 'border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    <div>
                      <span className="block font-bold text-xs text-slate-900">{sz.name}</span>
                      <span className="block text-[11px] font-semibold text-slate-400 mt-0.5">
                        {sz.width} × {sz.height} px
                      </span>
                    </div>
                    {isSelected && <Check size={16} className="text-primary" />}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Verðlagningarval */}
          <div className="space-y-4">
            <span className="block text-sm font-bold text-slate-700">Verðlagningarleið *</span>
            <div className="flex flex-col sm:flex-row gap-3">
              <button
                type="button"
                onClick={() => setPricingMode('cpm')}
                className={`flex-1 p-4 border rounded-xl text-left cursor-pointer transition-all ${
                  pricingMode === 'cpm'
                    ? 'border-primary bg-blue-50/20 ring-1 ring-primary'
                    : 'border-slate-200 hover:bg-slate-50'
                }`}
              >
                <span className="block font-bold text-xs text-slate-900">CPM (Verð per 1.000 sýningar)</span>
                <span className="block text-[11px] text-slate-500 mt-1 font-medium leading-relaxed">
                  Þú færð greitt fyrir hverjar 1.000 sýningar á auglýsingunni. Skynsamlegast fyrir nýja vefi.
                </span>
              </button>
              <button
                type="button"
                onClick={() => setPricingMode('slot')}
                className={`flex-1 p-4 border rounded-xl text-left cursor-pointer transition-all ${
                  pricingMode === 'slot'
                    ? 'border-primary bg-blue-50/20 ring-1 ring-primary'
                    : 'border-slate-200 hover:bg-slate-50'
                }`}
              >
                <span className="block font-bold text-xs text-slate-900">Tímabil (Fast gjald)</span>
                <span className="block text-[11px] text-slate-500 mt-1 font-medium leading-relaxed">
                  Auglýsandi leigir plássið fyrir fast verð yfir ákveðinn fjölda daga (t.d. 30 daga).
                </span>
              </button>
            </div>
          </div>

          {/* Verðlagningar inntak */}
          {pricingMode === 'cpm' ? (
            <div className="grid sm:grid-cols-2 gap-4">
              <Input
                type="number"
                label="CPM verð (kr. á hverjar 1.000 birtingar) *"
                placeholder="Dæmi: 550"
                value={cpmIsk}
                onChange={(e) => setCpmIsk(e.target.value)}
                required
                min={1}
                disabled={createSlotMutation.isPending}
              />
            </div>
          ) : (
            <div className="grid sm:grid-cols-2 gap-4">
              <Input
                type="number"
                label="Verð fyrir tímabilið (kr.) *"
                placeholder="Dæmi: 50000"
                value={slotPriceIsk}
                onChange={(e) => setSlotPriceIsk(e.target.value)}
                required
                min={1}
                disabled={createSlotMutation.isPending}
              />
              <Input
                type="number"
                label="Dagar í tímabili *"
                placeholder="Dæmi: 30"
                value={slotPeriodDays}
                onChange={(e) => setSlotPeriodDays(e.target.value)}
                required
                min={1}
                disabled={createSlotMutation.isPending}
              />
            </div>
          )}

          {/* Viðmið og aðstoð */}
          <div className="bg-slate-50 border border-slate-200 rounded-lg p-5 text-xs text-slate-650 space-y-2">
            <h5 className="font-bold text-slate-900 text-sm">Viðmið á íslenska markaðinum</h5>
            <p className="font-medium text-slate-500">Hér eru gróf viðmið til að hjálpa þér að verðleggja:</p>
            <ul className="list-disc pl-5 space-y-1 text-slate-500 font-medium">
              <li><strong>300x250 (in-content / hliðarborði)</strong>: ~400–800 kr. CPM</li>
              <li><strong>980x120 / 970x250 (leiðari / risaborði)</strong>: ~600–1.200 kr. CPM</li>
              <li><strong>320x100 (farsímar)</strong>: ~300–600 kr. CPM</li>
              <li><strong>Tímabil (slot leiga)</strong>: t.d. 30.000–80.000 kr. á mánuði fyrir 300x250 á miðlungsvef.</li>
            </ul>
            <p className="text-slate-400 mt-2 italic font-medium">
              Ábending: Fyrir nýja vefi án sannaðrar umferðar er oftast skynsamlegra að byrja með CPM – þá borga auglýsendur eingöngu fyrir raunverulegan birtingafjölda.
            </p>
          </div>

          {/* Auto Approve campaigns toggle */}
          <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 flex items-center justify-between">
            <div className="space-y-0.5">
              <span className="block font-bold text-sm text-slate-900">
                Sjálfvirk samþykkt (Auto Approve)
              </span>
              <span className="block text-xs text-slate-400 font-semibold leading-relaxed">
                Ræstu herferðir sjálfkrafa ef auglýsingin er sjálfkrafa samþykkt af
                Birtingur-skannanum.
              </span>
            </div>
            <input
              type="checkbox"
              checked={autoApprove}
              onChange={(e) => setAutoApprove(e.target.checked)}
              disabled={createSlotMutation.isPending}
              className="w-5 h-5 accent-primary cursor-pointer"
            />
          </div>

          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs font-semibold text-red-600">
              {error}
            </div>
          )}

          <div className="flex justify-between border-t border-slate-100 pt-5 mt-6">
            <Button
              type="button"
              variant="ghost"
              disabled={createSlotMutation.isPending}
              onClick={() => navigate('/publisher/slots')}
            >
              Hætta við
            </Button>
            <Button type="submit" loading={createSlotMutation.isPending} className="font-bold">
              Stofna pláss
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
