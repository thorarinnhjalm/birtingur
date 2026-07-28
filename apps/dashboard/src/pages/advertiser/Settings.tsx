import { useState, useEffect } from 'react';
import { useAdvertiser } from '@/hooks/useAdvertiser';
import { useApiKeys, useIssueApiKey, useRevokeApiKey } from '@/hooks/useApiKeys';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { LoadingState } from '@/components/ui/LoadingState';
import { ApiKeyPurchasePanel } from '@/components/ApiKeyPurchasePanel';
import { apiFetch } from '@/lib/api';
import { Check, ShieldAlert, Copy, Trash2, Key, Plus } from 'lucide-react';

export default function Settings() {
  const { data: advertiser, isLoading, refetch } = useAdvertiser();
  const [companyName, setCompanyName] = useState('');
  const [billingEmail, setBillingEmail] = useState('');
  const [vatNumber, setVatNumber] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // API Keys
  const { data: apiKeysRaw, isLoading: loadingKeys } = useApiKeys(!!advertiser);
  const apiKeys = (apiKeysRaw ?? []).filter((k) => !k.revoked);
  const issueApiKey = useIssueApiKey();
  const revokeApiKey = useRevokeApiKey();
  const [newKey, setNewKey] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState(false);

  useEffect(() => {
    if (advertiser) {
      setCompanyName(advertiser.companyName);
      setBillingEmail(advertiser.billingEmail || advertiser.ownerEmail);
      setVatNumber(advertiser.vatNumber);
    }
  }, [advertiser]);

  const handleGenerateKey = async () => {
    setNewKey(null);
    try {
      const res = await issueApiKey.mutateAsync('advertiser');
      setNewKey(res.apiKey);
    } catch (err: any) {
      alert(err.message || 'Ekki tókst að búa til API lykil.');
    }
  };

  const handleRevokeKey = async (id: string) => {
    if (
      !window.confirm(
        'Ertu viss um að þú viljir afturkalla þennan API lykil? Þessi aðgerð er óafturkræf og öll kerfi eða fulltrúar sem nota hann munu hætta að virka strax.',
      )
    ) {
      return;
    }
    try {
      await revokeApiKey.mutateAsync(id);
    } catch (err: any) {
      alert(err.message || 'Ekki tókst að afturkalla API lykil.');
    }
  };

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
        <p className="text-slate-500 text-sm font-medium mt-1">
          Umsjón með upplýsingum fyrirtækisins þíns og reikningsgerð.
        </p>
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
              Stofnað þann:{' '}
              {advertiser?.createdAt
                ? new Date(advertiser.createdAt).toLocaleDateString('is-IS')
                : ''}
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

      {/* API Tengingar (API Access) */}
      <Card className="p-6 space-y-6">
        <div>
          <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
            <Key size={20} className="text-blue-600" />
            <span>API Tengingar (API Access)</span>
          </h3>
          <p className="text-slate-500 text-sm font-medium mt-1">
            Búðu til API lykla til að tengja gervigreindarfulltrúa og ytri kerfi (t.d. Datera) við
            Birtingar-reikninginn þinn.
          </p>
        </div>

        {newKey && (
          <div className="p-4 bg-green-50 border border-green-200 rounded-xl space-y-3">
            <div className="flex items-start gap-3">
              <Check size={18} className="text-green-600 shrink-0 mt-0.5" />
              <div>
                <h4 className="font-bold text-sm text-green-900">
                  API lykill hefur verið búinn til!
                </h4>
                <p className="text-xs text-green-800/90 mt-1 leading-relaxed">
                  Afritaðu lykilinn og geymdu hann á öruggum stað. Af öryggisástæðum verður hann{' '}
                  <strong>ekki sýndur aftur</strong>.
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              <div className="font-mono text-xs bg-white text-slate-800 p-2.5 rounded-lg border border-green-200 grow select-all break-all font-semibold">
                {newKey}
              </div>
              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  navigator.clipboard.writeText(newKey);
                  setCopiedKey(true);
                  setTimeout(() => setCopiedKey(false), 2000);
                }}
                className="px-3 shrink-0"
              >
                {copiedKey ? (
                  <Check size={16} className="text-green-600 font-bold" />
                ) : (
                  <Copy size={16} />
                )}
              </Button>
            </div>
          </div>
        )}

        <div className="space-y-4 pt-3 border-t border-slate-100">
          <div className="flex justify-between items-center">
            <h4 className="font-bold text-sm text-slate-800">Virkir lyklar ({apiKeys.length})</h4>
            <Button
              type="button"
              onClick={handleGenerateKey}
              disabled={issueApiKey.isPending}
              className="text-xs py-1.5 px-3 flex items-center gap-1 font-bold"
            >
              <Plus size={14} />
              <span>Nýr API lykill</span>
            </Button>
          </div>

          {loadingKeys ? (
            <div className="text-slate-500 text-xs py-4 text-center">Hleð API lyklum...</div>
          ) : apiKeys.length === 0 ? (
            <div className="text-slate-400 text-xs py-6 text-center border border-dashed border-slate-200 rounded-xl">
              Engir virkir API lyklar fundust. Búðu til nýjan lykil til að tengja ytri kerfi.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-100 text-slate-500 font-bold uppercase tracking-wider">
                    <th className="py-2.5 font-bold">Lykilauðkenni (ID)</th>
                    <th className="py-2.5 font-bold">Umfang (Scope)</th>
                    <th className="py-2.5 font-bold">Stofnaður</th>
                    <th className="py-2.5 font-bold">Síðast notaður</th>
                    <th className="py-2.5 font-bold">Sjálfvirk kaup (Agent purchase)</th>
                    <th className="py-2.5 text-right font-bold">Aðgerðir</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                  {apiKeys.map((key) => (
                    <tr key={key.id} className="hover:bg-slate-50/50">
                      <td className="py-3 font-mono font-semibold align-top">{key.id}</td>
                      <td className="py-3 capitalize text-slate-600 font-semibold align-top">
                        {key.scope === 'both'
                          ? 'Allt'
                          : key.scope === 'advertiser'
                            ? 'Auglýsandi'
                            : 'Útgefandi'}
                      </td>
                      <td className="py-3 align-top">
                        {new Date(key.createdAt).toLocaleDateString('is-IS')}
                      </td>
                      <td className="py-3 align-top">
                        {key.lastUsedAt
                          ? new Date(key.lastUsedAt).toLocaleDateString('is-IS') +
                            ' ' +
                            new Date(key.lastUsedAt).toLocaleTimeString('is-IS', {
                              hour: '2-digit',
                              minute: '2-digit',
                            })
                          : 'Aldrei'}
                      </td>
                      <td className="py-3 align-top">
                        <ApiKeyPurchasePanel apiKey={key} />
                      </td>
                      <td className="py-3 text-right align-top">
                        <button
                          type="button"
                          onClick={() => handleRevokeKey(key.id)}
                          className="text-red-600 hover:text-red-800 transition flex items-center gap-1 ml-auto font-bold"
                        >
                          <Trash2 size={14} />
                          <span>Afturkalla</span>
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </Card>

      {/* Danger Zone */}
      <Card className="border-red-200 bg-red-50/20 p-6 space-y-4">
        <div className="flex gap-3 text-red-800">
          <ShieldAlert size={22} className="shrink-0 text-red-600" />
          <div>
            <h4 className="font-bold text-sm">Hættusvæði (Danger Zone)</h4>
            <p className="text-xs text-red-700/80 mt-1 leading-relaxed">
              Eyðing á aðgangi er óafturkræf. Inneign sem eftir er mun verða endurgreidd að
              frádregnum afgreiðslugjöldum og allar auglýsingar og herferðir verða eyddar.
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
