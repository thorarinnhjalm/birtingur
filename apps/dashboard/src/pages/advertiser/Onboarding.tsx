import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCreateAdvertiser } from '@/hooks/useAdvertiser';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';

export default function AdvertiserOnboarding() {
  const createAdvertiser = useCreateAdvertiser();
  const navigate = useNavigate();

  const [companyName, setCompanyName] = useState('');
  const [kennitala, setKennitala] = useState('');
  const [vatNumber, setVatNumber] = useState('');
  const [billingEmail, setBillingEmail] = useState('');
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Simple validation
    if (!companyName.trim() || !kennitala.trim() || !vatNumber.trim() || !billingEmail.trim()) {
      setError('Vinsamlegast fylltu út alla stjörnumerkta reiti');
      return;
    }

    try {
      await createAdvertiser.mutateAsync({
        companyName,
        kennitala,
        vatNumber,
        billingEmail,
      });
      // Redirect to advertiser home nudge or topup
      navigate('/advertiser');
    } catch (err: any) {
      setError(err.message || 'Ekki tókst að stofna aðgang. Vinsamlegast reyna aftur.');
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 p-6">
      <Card className="max-w-md w-full">
        <div className="text-center mb-6">
          <div className="text-xs uppercase font-extrabold tracking-wider text-primary">
            Skref 1 af 2
          </div>
          <h1 className="text-2xl font-bold mt-2">Stofna auglýsendaaðgang</h1>
          <p className="text-sm text-slate-500 mt-1 font-medium">
            Sláðu inn fyrirtækjaupplýsingar til að geta hafið auglýsingabirtingar.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            label="Fyrirtækisnafn *"
            placeholder="Dæmi: Blómabúðin ehf."
            value={companyName}
            onChange={(e) => setCompanyName(e.target.value)}
            required
            disabled={createAdvertiser.isPending}
          />

          <Input
            label="Kennitala *"
            placeholder="Dæmi: 550621-1230"
            value={kennitala}
            onChange={(e) => setKennitala(e.target.value)}
            required
            disabled={createAdvertiser.isPending}
          />

          <Input
            label="VSK-númer *"
            placeholder="Dæmi: 123456"
            value={vatNumber}
            onChange={(e) => setVatNumber(e.target.value)}
            required
            disabled={createAdvertiser.isPending}
          />

          <Input
            label="Netfang fyrir reikninga *"
            type="email"
            placeholder="bokanir@blomabudin.is"
            value={billingEmail}
            onChange={(e) => setBillingEmail(e.target.value)}
            required
            disabled={createAdvertiser.isPending}
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
              disabled={createAdvertiser.isPending}
              onClick={() => navigate('/role')}
            >
              Til baka
            </Button>
            <Button type="submit" loading={createAdvertiser.isPending}>
              Stofna aðgang
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
