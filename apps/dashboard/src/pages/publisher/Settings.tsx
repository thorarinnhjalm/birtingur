import { useState, useEffect } from 'react';
import { usePublisher } from '@/hooks/usePublisher';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { LoadingState } from '@/components/ui/LoadingState';
import { apiFetch } from '@/lib/api';
import { Check, Copy, RefreshCw, Trash2, Key, Plus } from 'lucide-react';
import { AD_CATEGORIES } from '@ada/shared';

export default function Settings() {
  const { data: publisher, isLoading, refetch } = usePublisher();

  const [displayName, setDisplayName] = useState('');
  const [domain, setDomain] = useState('');
  const [kennitala, setKennitala] = useState('');
  const [iban, setIban] = useState('');
  const [accountHolder, setAccountHolder] = useState('');
  const [vatNumber, setVatNumber] = useState('');
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);

  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [widgetKey, setWidgetKey] = useState<string | null>(null);
  const [loadingKey, setLoadingKey] = useState(false);
  const [rotatingKey, setRotatingKey] = useState(false);
  const [copiedScript, setCopiedScript] = useState(false);
  const [copiedStats, setCopiedStats] = useState(false);
  const [copiedQueue, setCopiedQueue] = useState(false);
  const [copiedMcp, setCopiedMcp] = useState(false);

  // API Keys state
  const [apiKeys, setApiKeys] = useState<any[]>([]);
  const [loadingKeys, setLoadingKeys] = useState(false);
  const [newKey, setNewKey] = useState<string | null>(null);
  const [generatingKey, setGeneratingKey] = useState(false);
  const [copiedKey, setCopiedKey] = useState(false);

  const fetchApiKeys = async () => {
    setLoadingKeys(true);
    try {
      const keys = await apiFetch<any[]>('/v1/api-keys');
      setApiKeys(keys.filter((k) => !k.revoked));
    } catch (err) {
      console.error('Ekki tókst að sækja API lykla:', err);
    } finally {
      setLoadingKeys(false);
    }
  };

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
      setVatNumber(publisher.vatNumber || '');
      setSelectedCategories(publisher.categories || []);
      fetchWidgetKey();
      fetchApiKeys();
    }
  }, [publisher]);

  const handleGenerateKey = async () => {
    setGeneratingKey(true);
    setNewKey(null);
    try {
      const res = await apiFetch<{ apiKey: string; apiKeyId: string }>('/v1/api-keys', {
        method: 'POST',
        body: JSON.stringify({ scope: 'publisher' }),
      });
      setNewKey(res.apiKey);
      fetchApiKeys();
    } catch (err: any) {
      alert(err.message || 'Ekki tókst að búa til API lykil.');
    } finally {
      setGeneratingKey(false);
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
      await apiFetch(`/v1/api-keys/${id}`, {
        method: 'DELETE',
      });
      fetchApiKeys();
    } catch (err: any) {
      alert(err.message || 'Ekki tókst að afturkalla API lykil.');
    }
  };

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

    if (selectedCategories.length === 0) {
      setError('Vinsamlegast veldu að minnsta kosti einn flokk efnis');
      setSaving(false);
      return;
    }

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
        vatNumber: vatNumber.trim() || undefined,
        categories: selectedCategories,
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

          <div className="space-y-2 pt-3 border-t border-slate-100">
            <label className="block text-sm font-bold text-slate-800">
              Flokkar efnis * (Veldu einn eða fleiri)
            </label>
            <p className="text-xs text-slate-400 mt-0.5">
              Veldu þá flokka sem lýsa efni síðunnar þinnar best. Auglýsendur munu geta keypt
              birtingar í þessum flokkum.
            </p>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2 pt-2">
              {AD_CATEGORIES.map((cat) => {
                const isSelected = selectedCategories.includes(cat.slug);
                return (
                  <div
                    key={cat.slug}
                    onClick={() => {
                      if (isSelected) {
                        if (selectedCategories.length > 1) {
                          setSelectedCategories(selectedCategories.filter((s) => s !== cat.slug));
                        }
                      } else {
                        setSelectedCategories([...selectedCategories, cat.slug]);
                      }
                    }}
                    className={`px-3 py-2 rounded-xl border text-xs font-bold cursor-pointer transition-all duration-200 text-center select-none ${
                      isSelected
                        ? 'bg-primary text-white border-primary shadow-md shadow-primary/10'
                        : 'bg-white text-slate-700 border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                    }`}
                  >
                    {cat.label}
                  </div>
                );
              })}
            </div>
          </div>

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

          <Input
            label="VSK-númer (valkvætt - ef skráð fyrirtæki)"
            value={vatNumber}
            onChange={(e) => setVatNumber(e.target.value)}
            disabled={saving}
            placeholder="t.d. 123456"
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
              disabled={generatingKey}
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
                    <th className="py-2.5 text-right font-bold">Aðgerðir</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                  {apiKeys.map((key) => (
                    <tr key={key.id} className="hover:bg-slate-50/50">
                      <td className="py-3 font-mono font-semibold">{key.id}</td>
                      <td className="py-3 capitalize text-slate-600 font-semibold">
                        {key.scope === 'both'
                          ? 'Allt'
                          : key.scope === 'advertiser'
                            ? 'Auglýsandi'
                            : 'Útgefandi'}
                      </td>
                      <td className="py-3">
                        {new Date(key.createdAt).toLocaleDateString('is-IS')}
                      </td>
                      <td className="py-3">
                        {key.lastUsedAt
                          ? new Date(key.lastUsedAt).toLocaleDateString('is-IS') +
                            ' ' +
                            new Date(key.lastUsedAt).toLocaleTimeString('is-IS', {
                              hour: '2-digit',
                              minute: '2-digit',
                            })
                          : 'Aldrei'}
                      </td>
                      <td className="py-3 text-right">
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

      {/* MCP Connection Guide */}
      <Card className="p-6 space-y-4">
        <div>
          <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
            <span className="material-symbols-outlined text-primary text-xl">smart_toy</span>
            <span>Gervigreindartenging (Model Context Protocol - MCP)</span>
          </h3>
          <p className="text-slate-500 text-sm font-medium mt-1">
            Tengdu gervigreindartól (eins og Claude Desktop eða Cursor) beint við Birting með Model
            Context Protocol. AI spjallmenn geta þá kynnt, greint eða stjórnað þínum gögnum með API
            lyklinum þínum.
          </p>
        </div>

        <div className="space-y-4 pt-3 border-t border-slate-100">
          <div className="space-y-2">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider block">
              MCP Endpoint slóð (Streamable HTTP)
            </span>
            <div className="flex gap-2">
              <div className="font-mono text-xs bg-slate-50 text-slate-800 p-2.5 rounded-lg border border-slate-200 grow select-all break-all font-semibold">
                https://mcp.birtingur.app/mcp
              </div>
              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  navigator.clipboard.writeText('https://mcp.birtingur.app/mcp');
                  setCopiedMcp(true);
                  setTimeout(() => setCopiedMcp(false), 2000);
                }}
                className="px-3 shrink-0"
              >
                {copiedMcp ? (
                  <Check size={16} className="text-green-600 font-bold" />
                ) : (
                  <Copy size={16} />
                )}
              </Button>
            </div>
          </div>

          <div className="space-y-3">
            <h4 className="text-xs font-bold text-slate-700">Uppsetning í Cursor / Windsurf</h4>
            <p className="text-xs text-slate-500 font-semibold leading-relaxed">
              Bættu við nýjum MCP netþjóni í Cursor stillingunum (Settings → Features → MCP):
            </p>
            <ul className="list-disc list-inside text-xs text-slate-600 font-semibold space-y-1 pl-1">
              <li>
                Heiti:{' '}
                <code className="font-mono bg-slate-100 px-1 rounded text-slate-800">
                  birtingur
                </code>
              </li>
              <li>
                Tegund (Type):{' '}
                <code className="font-mono bg-slate-100 px-1 rounded text-slate-800">http</code>
              </li>
              <li>
                Slóð (URL):{' '}
                <code className="font-mono bg-slate-100 px-1 rounded text-slate-800">
                  https://mcp.birtingur.app/mcp
                </code>
              </li>
              <li>
                Headers (lykilgildi):{' '}
                <code className="font-mono bg-slate-100 px-1 rounded text-slate-800">
                  {'Authorization: Bearer ak_xxx'}
                </code>{' '}
                (notaðu API lykilinn þinn fyrir ofan)
              </li>
            </ul>
          </div>

          <div className="space-y-2">
            <h4 className="text-xs font-bold text-slate-700">Uppsetning í Claude Desktop</h4>
            <p className="text-xs text-slate-500 font-semibold leading-relaxed">
              Bættu þessari stillingu við í{' '}
              <code className="font-mono bg-slate-100 px-1 rounded text-slate-800">
                claude_desktop_config.json
              </code>{' '}
              skránni þinni:
            </p>
            <pre className="font-mono text-[10px] bg-slate-900 text-slate-100 p-3 rounded-lg overflow-x-auto select-all leading-tight font-semibold">
              {`{
  "mcpServers": {
    "birtingur": {
      "command": "curl",
      "args": [
        "-X", "POST",
        "-H", "Authorization: Bearer ak_DÍNN_API_LYKILL_HÉR",
        "-H", "Content-Type: application/json",
        "-d", "{{mcp_payload}}",
        "https://mcp.birtingur.app/mcp"
      ]
    }
  }
}`}
            </pre>
          </div>

          <div className="space-y-2 pt-2 border-t border-slate-100">
            <h4 className="text-xs font-bold text-slate-700">Uppsetning í Claude Code (CLI)</h4>
            <p className="text-xs text-slate-500 font-semibold leading-relaxed">
              Keyrðu eftirfarandi skipun í skipanalínunni (terminalinu) til að bæta við Birtingi
              sjálfkrafa:
            </p>
            <pre className="font-mono text-[10px] bg-slate-900 text-slate-100 p-3 rounded-lg overflow-x-auto select-all leading-tight font-semibold whitespace-pre-wrap">
              {`claude mcp add birtingur curl -X POST -H "Authorization: Bearer ak_DÍNN_API_LYKILL_HÉR" -H "Content-Type: application/json" -d "{{mcp_payload}}" https://mcp.birtingur.app/mcp`}
            </pre>
            <p className="text-xs text-slate-500 font-semibold leading-relaxed mt-2">
              Eða ef þú vilt stilla þetta handvirkt eingöngu fyrir þetta verkefni, búðu til skrána{' '}
              <code className="font-mono bg-slate-100 px-1 rounded text-slate-800">.mcp.json</code>{' '}
              í rót verkefnisins (eða breyttu{' '}
              <code className="font-mono bg-slate-100 px-1 rounded text-slate-800">
                ~/.claude.json
              </code>{' '}
              fyrir allan notandann) með þessu innihaldi:
            </p>
            <pre className="font-mono text-[10px] bg-slate-900 text-slate-100 p-3 rounded-lg overflow-x-auto select-all leading-tight font-semibold">
              {`{
  "mcpServers": {
    "birtingur": {
      "command": "curl",
      "args": [
        "-X", "POST",
        "-H", "Authorization: Bearer ak_DÍNN_API_LYKILL_HÉR",
        "-H", "Content-Type: application/json",
        "-d", "{{mcp_payload}}",
        "https://mcp.birtingur.app/mcp"
      ]
    }
  }
}`}
            </pre>
          </div>
        </div>
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
                  {`<script src="https://cdn.birtingur.app/v1/widgets.js" defer></script>`}
                </div>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => {
                    navigator.clipboard.writeText(
                      '<script src="https://cdn.birtingur.app/v1/widgets.js" defer></script>',
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
