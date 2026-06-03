import { useState, useEffect } from 'react';
import { useAdvertiser } from '@/hooks/useAdvertiser';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { LoadingState } from '@/components/ui/LoadingState';
import { apiFetch } from '@/lib/api';
import { Check, ShieldAlert } from 'lucide-react';

export default function Settings() {
  const { data: advertiser, isLoading, refetch } = useAdvertiser();
  const [companyName, setCompanyName] = useState('');
  const [billingEmail, setBillingEmail] = useState('');
  const [vatNumber, setVatNumber] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (advertiser) {
      setCompanyName(advertiser.companyName);
      setBillingEmail(advertiser.ownerEmail);
      setVatNumber(advertiser.vatNumber);
    }
  }, [advertiser]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSaved(false);
    setError(null);

    try {
      await apiFetch(`/v1/advertisers/me`, {
        method: 'PUT',
        body: JSON.stringify({
          companyName,
          billingEmail,
          vatNumber,
        }),
      });
      setSaved(true);
      refetch();
      setTimeout(() => setSaved(false), 3000);
    } catch (err: any) {
      setError(err.message || 'Ekki tókst að vista stillingar.');
    } finally {
      setSaving(false);
    }
  };

  if (isLoading) return <LoadingState />;

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Stillingar aðgangs</h1>
        <p className="text-slate-500 text-sm font-medium mt-1">Umsjón með upplýsingum fyrirtækisins þíns og reikningsgerð.</p>
      </div>

      <Card className="p-6">
        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            label="Fyrirtækisnafn"
            value={companyName}
            onChange={(e) => setCompanyName(e.target.value)}
            required
            disabled={saving}
          />

          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Kennitala (Ekki hægt að breyta)"
              value={advertiser?.kennitala || ''}
              disabled
            />
            <Input
              label="VSK-númer"
              value={vatNumber}
              onChange={(e) => setVatNumber(e.target.value)}
              required
              disabled={saving}
            />
          </div>

          <Input
            label="Netfang fyrir reikninga"
            type="email"
            value={billingEmail}
            onChange={(e) => setBillingEmail(e.target.value)}
            required
            disabled={saving}
          />

          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs font-semibold text-red-600">
              {error}
            </div>
          )}

          <div className="flex items-center justify-between border-t border-slate-100 pt-5 mt-6">
            <div className="text-slate-500 text-xs font-medium">
              Stofnað þann: {advertiser?.createdAt ? new Date(advertiser.createdAt).toLocaleDateString('is-IS') : ''}
            </div>
            <div className="flex items-center gap-3">
              {saved && (
                <span className="text-green-600 text-xs font-bold flex items-center gap-1">
                  <Check size={14} />
                  <span>Stillingar vistaðar!</span>
                </span>
              )}
              <Button type="submit" loading={saving} className="font-bold text-sm">
                Vista breytingar
              </Button>
            </div>
          </div>
        </form>
      </Card>

      {/* Danger Zone */}
      <Card className="border-red-200 bg-red-50/20 p-6 space-y-4">
        <div className="flex gap-3 text-red-800">
          <ShieldAlert size={22} className="shrink-0 text-red-600" />
          <div>
            <h4 className="font-bold text-sm">Hættusvæði (Danger Zone)</h4>
            <p className="text-xs text-red-700/80 mt-1 leading-relaxed">
              Eyðing á aðgangi er óafturkræf. Inneign sem eftir er mun verða endurgreidd að frádregnum afgreiðslugjöldum og allar auglýsingar og herferðir verða eyddar.
            </p>
          </div>
        </div>
        <Button variant="danger" className="text-xs py-2 px-4 font-bold border border-transparent">
          Eyða auglýsendaaðgangi
        </Button>
      </Card>
    </div>
  );
}
