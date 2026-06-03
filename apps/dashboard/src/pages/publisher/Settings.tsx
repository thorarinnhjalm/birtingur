import { useState, useEffect } from 'react';
import { usePublisher } from '@/hooks/usePublisher';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { LoadingState } from '@/components/ui/LoadingState';
import { apiFetch } from '@/lib/api';
import { Check, Copy, RefreshCw } from 'lucide-react';

export default function Settings() {
  const { data: publisher, isLoading, refetch } = usePublisher();

  const [displayName, setDisplayName] = useState('');
  const [domain, setDomain] = useState('');
  const [kennitala, setKennitala] = useState('');
  const [iban, setIban] = useState('');
  const [accountHolder, setAccountHolder] = useState('');

  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [widgetKey, setWidgetKey] = useState<string | null>(null);
  const [loadingKey, setLoadingKey] = useState(false);
  const [rotatingKey, setRotatingKey] = useState(false);
  const [copiedScript, setCopiedScript] = useState(false);
  const [copiedStats, setCopiedStats] = useState(false);
  const [copiedQueue, setCopiedQueue] = useState(false);

  const fetchWidgetKey = async () => {
    if (!publisher) return;
    setLoadingKey(true);
    try {
      const res = await apiFetch<{ key: string }>(`/v1/publishers/me/widget-key`);
      setWidgetKey(res.key);
    } catch (err) {
      console.error('Error fetching widget key:', err);
    } finally {
      setLoadingKey(false);
    }
  };

  useEffect(() => {
    if (publisher) {
      setDisplayName(publisher.displayName);
      setDomain(publisher.domain);
      setKennitala(publisher.payoutMethod?.kennitala || '');
      setIban(publisher.payoutMethod?.iban || '');
      setAccountHolder(publisher.payoutMethod?.accountName || '');
      fetchWidgetKey();
    }
  }, [publisher]);

  const handleRotateKey = async () => {
    if (
      !window.confirm(
        'Ertu viss um að þú viljir endurnýja vefkassalykilinn? Eldri innfelldir kassar munu hætta að virka þar til nýi lykillinn er uppfærður á vefsíðunni þinni.',
      )
    ) {
      return;
    }
    setRotatingKey(true);
    try {
      const res = await apiFetch<{ key: string }>(`/v1/publishers/me/widget-key/rotate`, {
        method: 'POST',
      });
      setWidgetKey(res.key);
    } catch (err) {
      console.error('Error rotating key:', err);
      alert('Ekki tókst að endurnýja lykil.');
    } finally {
      setRotatingKey(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSaved(false);
    setError(null);

    const hasAnyBankDetail = kennitala.trim() || iban.trim() || accountHolder.trim();
    const hasAllBankDetails = kennitala.trim() && iban.trim() && accountHolder.trim();

    if (hasAnyBankDetail && !hasAllBankDetails) {
      setError(
        'Ef bankaupplýsingar eru skráðar þarf að fylla út alla þrjá bankareitina (eða skilja alla eftir auða)',
      );
      setSaving(false);
      return;
    }

    try {
      const updateData: any = {
        displayName,
        domain,
      };

      if (hasAllBankDetails) {
        updateData.payoutMethod = {
          type: 'bank',
          iban,
          kennitala,
          accountName: accountHolder,
        };
      }

      await apiFetch(`/v1/publishers/me`, {
        method: 'PATCH',
        body: JSON.stringify(updateData),
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
        <h1 className="text-2xl font-bold text-slate-900">Stillingar vefs og greiðslna</h1>
        <p className="text-slate-500 text-sm font-medium mt-1">
          Stjórnaðu upplýsingum og bankareikningum fyrir útborganir.
        </p>
      </div>

      <Card className="p-6">
        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            label="Opinbert heiti vefsíðu *"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            required
            disabled={saving}
          />

          <Input
            label="Lén (Domain) *"
            value={domain}
            onChange={(e) => setDomain(e.target.value)}
            required
            disabled={saving}
          />

          <h4 className="font-bold text-sm text-slate-800 pt-3 border-t border-slate-100">
            Bankaupplýsingar fyrir útborganir
          </h4>

          <Input
            label="Kennitala (valkvætt)"
            value={kennitala}
            onChange={(e) => setKennitala(e.target.value)}
            disabled={saving}
          />

          <Input
            label="Reikningsnúmer (valkvætt)"
            value={iban}
            onChange={(e) => setIban(e.target.value)}
            disabled={saving}
          />

          <Input
            label="Nafn reikningshafa (valkvætt)"
            value={accountHolder}
            onChange={(e) => setAccountHolder(e.target.value)}
            disabled={saving}
          />

          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs font-semibold text-red-600">
              {error}
            </div>
          )}

          <div className="flex items-center justify-between border-t border-slate-100 pt-5 mt-6">
            <div className="text-slate-500 text-xs font-medium">
              Útgefandaauðkenni: {publisher?.id}
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

      {publisher && (
        <Card className="p-6 space-y-4">
          <div>
            <h3 className="text-lg font-bold text-slate-900">Innfelldir vefkassar (Widgets)</h3>
            <p className="text-slate-500 text-sm font-medium mt-1">
              Sýndu tölfræði eða birtu umsóknir til samþykktar beint í þínu eigin kerfi (t.d. í CMS
              kerfinu þínu).
            </p>
          </div>

          <div className="space-y-4 pt-3 border-t border-slate-100">
            {/* Widget Key Display */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-4 bg-slate-50 border border-slate-200 rounded-xl">
              <div className="space-y-1">
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wider block">
                  Vefkassalykill (Widget Key)
                </span>
                <div className="font-mono text-sm font-semibold text-slate-800 break-all select-all">
                  {loadingKey ? 'Hleð lykli...' : widgetKey || 'Enginn virkur lykill'}
                </div>
              </div>
              <Button
                type="button"
                onClick={handleRotateKey}
                disabled={rotatingKey || loadingKey}
                variant="secondary"
                className="font-semibold text-xs py-1.5 px-3 flex items-center gap-1.5 shrink-0 self-start md:self-center"
              >
                <RefreshCw size={12} className={rotatingKey ? 'animate-spin' : ''} />
                Nýr lykill
              </Button>
            </div>

            {/* Script include */}
            <div className="space-y-2">
              <label className="text-sm font-bold text-slate-700 block">
                1. Setja skriftu í head eða body
              </label>
              <div className="flex gap-2">
                <div className="font-mono text-xs bg-slate-900 text-slate-100 p-3 rounded-lg grow overflow-x-auto whitespace-nowrap">
                  {`<script src="https://cdn.adplatform.is/v1/widgets.js" defer></script>`}
                </div>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => {
                    navigator.clipboard.writeText(
                      '<script src="https://cdn.adplatform.is/v1/widgets.js" defer></script>',
                    );
                    setCopiedScript(true);
                    setTimeout(() => setCopiedScript(false), 2000);
                  }}
                  className="px-3 py-2"
                >
                  {copiedScript ? (
                    <Check size={16} className="text-green-600" />
                  ) : (
                    <Copy size={16} />
                  )}
                </Button>
              </div>
            </div>

            {/* Stats widget code */}
            <div className="space-y-2">
              <label className="text-sm font-bold text-slate-700 block">
                2. Tölfræðikassi (Stats Widget)
              </label>
              <div className="flex gap-2">
                <div className="font-mono text-xs bg-slate-900 text-slate-100 p-3 rounded-lg grow overflow-x-auto whitespace-nowrap">
                  {`<adplatform-stats publisher-key="${widgetKey || 'HLEÐ...'}" period="30d"></adplatform-stats>`}
                </div>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => {
                    navigator.clipboard.writeText(
                      `<adplatform-stats publisher-key="${widgetKey || ''}" period="30d"></adplatform-stats>`,
                    );
                    setCopiedStats(true);
                    setTimeout(() => setCopiedStats(false), 2000);
                  }}
                  className="px-3 py-2"
                >
                  {copiedStats ? (
                    <Check size={16} className="text-green-600" />
                  ) : (
                    <Copy size={16} />
                  )}
                </Button>
              </div>
            </div>

            {/* Approval queue widget code */}
            <div className="space-y-2">
              <label className="text-sm font-bold text-slate-700 block">
                3. Samþykktarbiðröð (Approval Queue Widget)
              </label>
              <div className="flex gap-2">
                <div className="font-mono text-xs bg-slate-900 text-slate-100 p-3 rounded-lg grow overflow-x-auto whitespace-nowrap">
                  {`<adplatform-approval-queue publisher-key="${widgetKey || 'HLEÐ...'}"></adplatform-approval-queue>`}
                </div>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => {
                    navigator.clipboard.writeText(
                      `<adplatform-approval-queue publisher-key="${widgetKey || ''}"></adplatform-approval-queue>`,
                    );
                    setCopiedQueue(true);
                    setTimeout(() => setCopiedQueue(false), 2000);
                  }}
                  className="px-3 py-2"
                >
                  {copiedQueue ? (
                    <Check size={16} className="text-green-600" />
                  ) : (
                    <Copy size={16} />
                  )}
                </Button>
              </div>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}
