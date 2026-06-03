import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCreatePublisher } from '@/hooks/usePublisher';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';

export default function PublisherOnboarding() {
  const createPublisher = useCreatePublisher();
  const navigate = useNavigate();

  const [domain, setDomain] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [category, setCategory] = useState('news');
  
  // Payout Details
  const [kennitala, setKennitala] = useState('');
  const [iban, setIban] = useState('');
  const [accountHolder, setAccountHolder] = useState('');
  const [minimumPayout, setMinimumPayout] = useState(5000);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!domain.trim() || !displayName.trim()) {
      setError('Vinsamlegast fylltu út alla stjörnumerkta reiti');
      return;
    }

    const hasAnyBankDetail = kennitala.trim() || iban.trim() || accountHolder.trim();
    const hasAllBankDetails = kennitala.trim() && iban.trim() && accountHolder.trim();

    if (hasAnyBankDetail && !hasAllBankDetails) {
      setError('Ef bankaupplýsingar eru skráðar þarf að fylla út alla þrjá bankareitina (eða skilja alla eftir auða)');
      return;
    }

    try {
      await createPublisher.mutateAsync({
        domain,
        displayName,
        category,
        payoutDetails: hasAllBankDetails ? {
          kennitala,
          iban,
          accountHolder,
        } : undefined,
        minimumPayoutIsk: minimumPayout,
      });
      navigate('/publisher');
    } catch (err: any) {
      setError(err.message || 'Ekki tókst að stofna útgefandaaðgang. Reyndu aftur.');
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 p-6">
      <Card className="max-w-md w-full">
        <div className="text-center mb-6">
          <div className="text-xs uppercase font-extrabold tracking-wider text-sky-600">Skref 1 af 2</div>
          <h1 className="text-2xl font-bold mt-2">Stofna útgefandaaðgang</h1>
          <p className="text-sm text-slate-500 mt-1 font-medium">
            Skráðu vef þinn og bankaupplýsingar til að byrja að selja auglýsingapláss.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            label="Lén vefsíðu *"
            placeholder="Dæmi: tæknifrettir.is"
            value={domain}
            onChange={(e) => setDomain(e.target.value)}
            required
            disabled={createPublisher.isPending}
          />

          <Input
            label="Opinbert heiti vefsíðu *"
            placeholder="Dæmi: Tæknifréttir"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            required
            disabled={createPublisher.isPending}
          />

          <label className="block w-full">
            <span className="block text-sm font-medium text-slate-700 mb-1">Aðalflokkur efnis *</span>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full px-4 py-3 border border-slate-300 rounded-lg text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary text-sm shadow-[0_1px_2px_rgba(0,0,0,0.02)]"
            >
              <option value="news">Fréttir / Fjölmiðlar</option>
              <option value="lifestyle">Lífsstíll / Blogg</option>
              <option value="tech">Tækni / Leikir</option>
              <option value="sports">Íþróttir</option>
              <option value="business">Viðskipti / Fjármál</option>
            </select>
          </label>

          <h4 className="font-bold text-sm text-slate-800 pt-3 border-t border-slate-100">Bankaupplýsingar fyrir útborganir</h4>

          <Input
            label="Kennitala reikningshafa (valkvætt)"
            placeholder="Dæmi: 550621-1230"
            value={kennitala}
            onChange={(e) => setKennitala(e.target.value)}
            disabled={createPublisher.isPending}
          />

          <Input
            label="Reikningsnúmer (Útibú-höfuðbók-reikningur) (valkvætt)"
            placeholder="Dæmi: 0111-26-003450"
            value={iban}
            onChange={(e) => setIban(e.target.value)}
            disabled={createPublisher.isPending}
          />

          <Input
            label="Nafn reikningshafa (valkvætt)"
            placeholder="Nafn eins og það birtist í netbanka"
            value={accountHolder}
            onChange={(e) => setAccountHolder(e.target.value)}
            disabled={createPublisher.isPending}
          />

          <Input
            label="Lágmarksútborgun (kr) *"
            type="number"
            min="5000"
            step="1000"
            value={minimumPayout}
            onChange={(e) => setMinimumPayout(Number(e.target.value) || 5000)}
            required
            disabled={createPublisher.isPending}
          />

          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs font-semibold text-red-600">
              {error}
            </div>
          )}

          <div className="flex gap-3 justify-end pt-4 border-t border-slate-100">
            <Button
              type="button"
              variant="ghost"
              disabled={createPublisher.isPending}
              onClick={() => navigate('/role')}
            >
              Til baka
            </Button>
            <Button type="submit" loading={createPublisher.isPending}>
              Stofna aðgang
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
