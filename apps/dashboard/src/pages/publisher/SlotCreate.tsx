import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCreateSlot } from '@/hooks/usePublisher';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { IAB_STANDARD_SIZES } from '@ada/shared';
import { ShieldCheck, Plus, Check } from 'lucide-react';

export default function SlotCreate() {
  const navigate = useNavigate();
  const createSlotMutation = useCreateSlot();

  const [name, setName] = useState('');
  const [selectedSizes, setSelectedSizes] = useState<Array<{ width: number; height: number }>>([]);
  const [priceType, setPriceType] = useState<'cpm' | 'flat'>('cpm');
  const [amount, setAmount] = useState(1500);
  const [categories, setCategories] = useState<string[]>([]);
  const [autoApprove, setAutoApprove] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
    if (amount <= 0) {
      setError('Upphæð verður að vera stærri en 0 kr.');
      return;
    }

    try {
      await createSlotMutation.mutateAsync({
        name,
        sizes: selectedSizes,
        pricing: {
          type: priceType,
          amountIsk: amount,
        },
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

          {/* Pricing Config */}
          <div className="grid grid-cols-2 gap-4">
            <label className="block w-full">
              <span className="block text-sm font-medium text-slate-700 mb-1">Greiðslukerfi</span>
              <select
                value={priceType}
                onChange={(e) => setPriceType(e.target.value as 'cpm' | 'flat')}
                disabled={createSlotMutation.isPending}
                className="w-full px-4 py-3 border border-slate-300 rounded-lg text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary text-sm shadow-[0_1px_2px_rgba(0,0,0,0.02)]"
              >
                <option value="cpm">CPM (kr. fyrir hverjar 1.000 flettingar)</option>
                <option value="flat">Fast verð (Fast gjald á viku)</option>
              </select>
            </label>

            <Input
              label={priceType === 'cpm' ? 'CPM Verð (kr.) *' : 'Flat rate Verð á viku (kr.) *'}
              type="number"
              min="1"
              value={amount}
              onChange={(e) => setAmount(Number(e.target.value) || 0)}
              required
              disabled={createSlotMutation.isPending}
            />
          </div>

          {/* Auto Approve campaigns toggle */}
          <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 flex items-center justify-between">
            <div className="space-y-0.5">
              <span className="block font-bold text-sm text-slate-900">
                Sjálfvirk samþykkt (Auto Approve)
              </span>
              <span className="block text-xs text-slate-400 font-semibold leading-relaxed">
                Ræstu herferðir sjálfkrafa ef auglýsingin er auto-approved af ADA scanner.
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
