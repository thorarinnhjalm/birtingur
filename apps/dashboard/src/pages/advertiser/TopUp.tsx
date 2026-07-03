import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTopUp, useWallet, useWalletTransactions } from '@/hooks/useWallet';
import { useAdvertiser } from '@/hooks/useAdvertiser';
import { useAuth } from '@/lib/auth-context';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import { EditorialH1 } from '@/components/ui/editorial';
import { formatIsk } from '@/lib/format';
import { VAT_RATE, DEFAULT_PLATFORM_FEE_PERCENT } from '@ada/shared';
import { AlertCircle, CreditCard, Lock, CheckCircle, AlertTriangle, FileText } from 'lucide-react';

const PRESETS = [5000, 20000, 50000, 100000];

export default function TopUp() {
  const wallet = useWallet();
  const topup = useTopUp();
  const transactions = useWalletTransactions();
  const advertiserQuery = useAdvertiser();
  const { user } = useAuth();
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
  // VAT is calculated only on the platform brokerage fee.
  const platformFee = Math.round(amount * (DEFAULT_PLATFORM_FEE_PERCENT / 100));
  const platformFeeVat = Math.round(platformFee * VAT_RATE);

  function printInvoice(tx: any) {
    const adv = advertiserQuery.data;
    if (!adv) return;

    // Derive the split from the shared business constants so this legal
    // document can't drift from the platform's actual fee/VAT rates.
    const isRefund = tx.type === 'refund';
    const feeRate = DEFAULT_PLATFORM_FEE_PERCENT / 100;
    const txAmount = Math.abs(tx.amountIsk);
    const deposit = Math.round(txAmount * (1 - feeRate));
    const fee = Math.round(txAmount * feeRate);
    const vat = Math.round(fee * VAT_RATE);
    const vatPct = Math.round(VAT_RATE * 100);
    const docTitle = isRefund ? 'Kreditreikningur / Endurgreiðsla' : 'Greiðslukvittun / Reikningur';
    const lineDesc = isRefund
      ? 'Endurgreiðsla af veltureikningi hjá Birtingi (Umboðssala - VSK-frítt)'
      : 'Innborgun á veltureikning hjá Birtingi (Umboðssala - VSK-frítt)';
    const feeDesc = isRefund
      ? `Bakfærð umsýslu- og bókunarþóknun (${DEFAULT_PLATFORM_FEE_PERCENT}% af endurgreiðslu)`
      : `Umsýslu- og bókunarþóknun Birtingar (${DEFAULT_PLATFORM_FEE_PERCENT}% af innborgun)`;
    const totalLabel = isRefund ? 'Endurgreidd heildarupphæð:' : 'Greidd heildarupphæð:';
    const confirmsWhat = isRefund ? 'endurgreiðslu' : 'kortagreiðslu';

    const invoiceWindow = window.open('', '_blank');
    if (!invoiceWindow) {
      alert('Vinsamlegast leyfðu sprettiglugga (pop-ups) til að opna reikninginn.');
      return;
    }

    const dateStr = new Date(tx.createdAt).toLocaleDateString('is-IS', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });

    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Birtingur - Reikningur ${tx.id}</title>
        <meta charset="utf-8" />
        <style>
          body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
            color: #1e293b;
            padding: 40px;
            max-width: 800px;
            margin: 0 auto;
            line-height: 1.5;
          }
          .header {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            border-bottom: 2px solid #e2e8f0;
            padding-bottom: 20px;
            margin-bottom: 30px;
          }
          .logo {
            font-size: 26px;
            font-weight: 900;
            color: #2563eb;
            letter-spacing: -0.03em;
          }
          .title {
            text-align: right;
          }
          .title h1 {
            margin: 0;
            font-size: 22px;
            font-weight: 800;
            color: #0f172a;
          }
          .title p {
            margin: 5px 0 0 0;
            font-size: 13px;
            color: #64748b;
            font-weight: 600;
          }
          .details {
            display: grid;
            grid-template-cols: 1fr 1fr;
            gap: 40px;
            margin-bottom: 40px;
          }
          .section-title {
            font-size: 11px;
            font-weight: 800;
            text-transform: uppercase;
            letter-spacing: 0.05em;
            color: #94a3b8;
            margin-bottom: 10px;
          }
          .company-info p {
            margin: 4px 0;
            font-size: 13px;
            font-weight: 500;
          }
          .table {
            width: 100%;
            border-collapse: collapse;
            margin-bottom: 35px;
          }
          .table th {
            border-bottom: 2px solid #cbd5e1;
            text-align: left;
            padding: 10px 0;
            font-size: 12px;
            font-weight: 700;
            color: #475569;
          }
          .table td {
            border-bottom: 1px solid #e2e8f0;
            padding: 12px 0;
            font-size: 13px;
            font-weight: 500;
          }
          .table .right {
            text-align: right;
          }
          .summary {
            margin-left: auto;
            width: 320px;
            margin-bottom: 40px;
          }
          .summary-row {
            display: flex;
            justify-content: space-between;
            padding: 8px 0;
            font-size: 13px;
            font-weight: 550;
            border-bottom: 1px solid #f1f5f9;
          }
          .summary-row.total {
            font-size: 17px;
            font-weight: 900;
            border-bottom: none;
            color: #0f172a;
            padding-top: 12px;
            border-top: 2px solid #e2e8f0;
          }
          .footnote {
            font-size: 10.5px;
            color: #64748b;
            line-height: 1.6;
            background: #f8fafc;
            padding: 18px;
            border-radius: 10px;
            font-weight: 500;
            margin-top: 60px;
            border: 1px solid #f1f5f9;
          }
          @media print {
            body {
              padding: 20px;
            }
            .no-print {
              display: none;
            }
          }
          .print-btn {
            background-color: #2563eb;
            color: white;
            border: none;
            padding: 10px 22px;
            font-size: 13px;
            font-weight: 700;
            border-radius: 8px;
            cursor: pointer;
            transition: background-color 0.15s;
            margin-bottom: 20px;
            box-shadow: 0 4px 6px -1px rgba(37,99,235,0.1), 0 2px 4px -1px rgba(37,99,235,0.06);
          }
          .print-btn:hover {
            background-color: #1d4ed8;
          }
        </style>
      </head>
      <body>
        <div class="no-print" style="text-align: right;">
          <button class="print-btn" onclick="window.print()">Prenta reikning</button>
        </div>
        <div class="header">
          <div class="logo">Birtingur</div>
          <div class="title">
            <h1>${docTitle}</h1>
            <p>Færslunúmer: ${tx.id}</p>
            <p>Dagsetning: ${dateStr}</p>
          </div>
        </div>
        
        <div class="details">
          <div>
            <div class="section-title">Seljandi</div>
            <div class="company-info">
              <p style="font-weight: 700; font-size: 14px;">Birtingur ehf.</p>
              <p>Kennitala: 590124-0320</p>
              <p>VSK-númer: 151234</p>
              <p>Netfang: bokhald@birtingur.is</p>
              <p>Vefur: birtingur.is</p>
            </div>
          </div>
          <div>
            <div class="section-title">Kaupandi</div>
            <div class="company-info">
              <p style="font-weight: 700; font-size: 14px;">${adv.companyName}</p>
              <p>Kennitala: ${adv.kennitala || '-'}</p>
              <p>VSK-númer: ${adv.vatNumber || '-'}</p>
              <p>Netfang: ${adv.billingEmail || user?.email || '-'}</p>
            </div>
          </div>
        </div>

        <table class="table">
          <thead>
            <tr>
              <th>Lýsing</th>
              <th class="right">Magn</th>
              <th class="right">Einingaverð</th>
              <th class="right">Samtals</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>${lineDesc}</td>
              <td class="right">1</td>
              <td class="right">${deposit.toLocaleString('is-IS')} kr.</td>
              <td class="right">${deposit.toLocaleString('is-IS')} kr.</td>
            </tr>
            <tr>
              <td>${feeDesc}</td>
              <td class="right">1</td>
              <td class="right">${fee.toLocaleString('is-IS')} kr.</td>
              <td class="right">${fee.toLocaleString('is-IS')} kr.</td>
            </tr>
          </tbody>
        </table>

        <div class="summary">
          <div class="summary-row">
            <span>VSK-frjáls velta (Umboðssala ${100 - DEFAULT_PLATFORM_FEE_PERCENT}%):</span>
            <span>${deposit.toLocaleString('is-IS')} kr.</span>
          </div>
          <div class="summary-row">
            <span>Gjaldstofn VSK (Þóknun ${DEFAULT_PLATFORM_FEE_PERCENT}%):</span>
            <span>${fee.toLocaleString('is-IS')} kr.</span>
          </div>
          <div class="summary-row">
            <span>Virðisaukaskattur (${vatPct}% af þóknun):</span>
            <span>${vat.toLocaleString('is-IS')} kr.</span>
          </div>
          <div class="summary-row total">
            <span>${totalLabel}</span>
            <span>${txAmount.toLocaleString('is-IS')} kr.</span>
          </div>
        </div>

        <div class="footnote">
          * Samkvæmt 10. gr. laga nr. 50/1988 um virðisaukaskatt og sérreglum um umboðssölu er innlögn á veltureikning til auglýsingakaupa undanþegin virðisaukaskatti við innborgun. Birtingur ehf. innheimtir virðisaukaskatt (${vatPct}%) eingöngu af eigin bókunarþóknun (${DEFAULT_PLATFORM_FEE_PERCENT}% af ráðstafaðri upphæð) jafnóðum og herferðir eru birtar. Þessi reikningur þjónar sem staðfesting á ${confirmsWhat} og sundurliðun á áætlaðri þóknun og sköttum.
        </div>
      </body>
      </html>
    `;

    invoiceWindow.document.write(htmlContent);
    invoiceWindow.document.close();
  }

  // Icelandic dot-grouped integer — same local-fmtNum convention as the other
  // redesigned advertiser pages (CampaignCreate/CampaignList/CreativeLibrary),
  // used only for the per-row VSK figure below where formatIsk's "kr." suffix
  // would be redundant next to the "VSK (24%)" column header.
  function fmtNum(n: number): string {
    return Math.round(n).toLocaleString('is-IS', { maximumFractionDigits: 0 });
  }

  return (
    // Constrained to a moderate single-column width (same max-w-[760px]
    // convention CampaignCreate.tsx uses for its own money-flow content)
    // rather than the full AppShell max-w-7xl the list/grid pages use — the
    // amount picker and VSK breakdown are a narrow form, and the pre-redesign
    // page was narrower still (max-w-xl). The invoice table below gained two
    // columns (VSK, Staða) versus the pre-redesign version, so it needs more
    // room than the old max-w-xl gave it; 760px plus the existing
    // overflow-x-auto safety net covers both without going full-bleed.
    <div
      className="mx-auto max-w-[760px]"
      style={{ display: 'flex', flexDirection: 'column', gap: 'clamp(32px,4vw,48px)' }}
    >
      {/* ===== PAGE HEADER =====
          Title/subtitle copied verbatim from billing.dc.html. Renamed from the
          pre-redesign "Setja inn inneign" — "Greiðslur" already matches this
          route's own sidebar label (AdvertiserDashboard.tsx's sidebarItems),
          and better describes what the page now shows end to end: balance,
          top-up, and invoice history. */}
      <header>
        <EditorialH1>Greiðslur</EditorialH1>
        <p className="mt-3 text-[15px] text-slate-500">Veskið þitt, greiðslusaga og reikningar</p>
      </header>

      {/* Success/cancelled return banners — not in the template (a static
          mock has no redirect-return state), kept because the Teya checkout
          redirects back here with ?success=true/?cancelled=true and the
          advertiser needs that confirmation. Unchanged logic, restyled to
          rounded-card for consistency with the rest of this pass. */}
      {success && (
        <div className="flex items-start gap-3 rounded-card border border-emerald-200 bg-emerald-50 p-4 text-emerald-800 shadow-sm">
          <CheckCircle className="mt-0.5 shrink-0 text-emerald-500" size={18} />
          <div>
            <h4 className="text-sm font-bold text-emerald-900">Innborgun tókst!</h4>
            <p className="mt-0.5 text-xs font-medium text-emerald-700">
              Greiðslan hefur verið staðfest og inneignin hefur verið uppfærð á aðgangi þínum.
            </p>
          </div>
        </div>
      )}

      {cancelled && (
        <div className="flex items-start gap-3 rounded-card border border-amber-200 bg-amber-50 p-4 text-amber-800 shadow-sm">
          <AlertTriangle className="mt-0.5 shrink-0 text-amber-500" size={18} />
          <div>
            <h4 className="text-sm font-bold text-amber-900">Hætt við greiðslu</h4>
            <p className="mt-0.5 text-xs font-medium text-amber-700">
              Hætt var við greiðsluferlið. Engir peningar voru dregnir af kortinu þínu.
            </p>
          </div>
        </div>
      )}

      {/* ===== WALLET SUMMARY =====
          Balance row + description copied in shape from billing.dc.html's
          wallet-summary card. The template's own "Bæta við inneign" button
          navigates elsewhere; there is no separate destination here since
          this page already *is* the top-up flow (the amount picker sits
          immediately below), so the button is dropped rather than wired to
          a no-op. Copy is adapted (not verbatim) for the same reason —
          the template's line assumes a card auto-fills the wallet elsewhere
          ("...á þegar hana þrýtur" implying automatic refill), which doesn't
          exist in this product; see the STAT CARDS and PAYMENT METHOD notes
          below for the fuller no-invented-claims rationale. */}
      <Card className="p-6">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4">
          <span className="text-sm font-semibold text-slate-500">
            Núverandi inneign í veskinu þínu:
          </span>
          <span className="text-[22px] font-extrabold tracking-[-0.02em] text-slate-900 tabular-nums">
            {wallet.isLoading ? 'Hleður...' : formatIsk(wallet.data?.balanceIsk ?? 0)}
          </span>
        </div>
        <p className="mt-4 max-w-[46ch] text-sm leading-relaxed text-slate-500">
          Inneignin er notuð til að greiða fyrir birtingar herferða þinna. Veldu upphæð hér að neðan
          til að fylla á.
        </p>
      </Card>

      {/* ===== ADD FUNDS =====
          Amount picker, VSK breakdown, submit and trust line — not pictured
          in billing.dc.html at all (the template assumes a stored card
          auto-refills the wallet; this product only ever tops up manually via
          a Teya checkout redirect chosen here). Kept in full because this is
          the page's actual reason to exist; every handler, state variable and
          the platformFee/platformFeeVat math above are untouched from the
          pre-redesign implementation. Restyled with the same Card, tabular
          numerals and VAT_RATE-driven label used on CampaignCreate's
          equivalent "Greiðsla" breakdown, and the buy-flow spec's Lock-icon
          trust line convention (billing.dc.html has no trust line of its
          own), so this money screen matches its sibling rather than the
          template's mismatched mock. */}
      <Card className="p-6">
        <div>
          <span className="mb-2 block text-sm font-medium text-slate-700">Veldu upphæð</span>
          <div className="grid grid-cols-4 gap-2">
            {PRESETS.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => {
                  setAmount(p);
                  setError(null);
                }}
                className={`cursor-pointer rounded-lg border py-3 text-sm font-bold transition-all ${
                  amount === p
                    ? 'border-primary bg-primary text-white shadow-[0_2px_4px_rgba(30,58,138,0.15)]'
                    : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50'
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

        {/* Pricing breakdown — unchanged formulas (platformFee/platformFeeVat
            computed above from DEFAULT_PLATFORM_FEE_PERCENT and VAT_RATE),
            restyled to tabular numerals; the "(24%)" label is now derived
            from VAT_RATE instead of a hardcoded string. */}
        <div className="mt-6 space-y-3 border-t border-slate-200 pt-6 text-sm">
          <div className="flex justify-between font-medium text-slate-600">
            <span>Innlögn á veltureikning (VSK-frítt)</span>
            <span className="tabular-nums">{formatIsk(amount)}</span>
          </div>
          <div className="flex justify-between border-l-2 border-slate-200 pl-2 text-xs font-medium text-slate-500">
            <span>Áætluð þóknun Birtingar ({DEFAULT_PLATFORM_FEE_PERCENT}%)</span>
            <span className="tabular-nums">{formatIsk(platformFee)}</span>
          </div>
          <div className="flex justify-between border-l-2 border-slate-200 pl-2 text-xs font-medium text-slate-500">
            <span>Áætlaður VSK af þóknun ({Math.round(VAT_RATE * 100)}%)</span>
            <span className="tabular-nums">{formatIsk(platformFeeVat)}</span>
          </div>
          <div className="flex justify-between border-t border-slate-100 pt-3 text-base font-extrabold text-slate-900">
            <span>Heildargreiðsla</span>
            <span className="tabular-nums">{formatIsk(amount)}</span>
          </div>
          <p className="mt-2 text-[10px] leading-relaxed font-medium text-slate-400">
            * Samkvæmt lögum um umboðssölu er innlögnin sjálf VSK-frjáls innlögn á veltureikning.
            Virðisaukaskattur ({Math.round(VAT_RATE * 100)}%) reiknast eingöngu af þjónustuþóknun
            Birtingar ({DEFAULT_PLATFORM_FEE_PERCENT}%) þegar auglýsingar eru sýndar.
          </p>
        </div>

        {error && (
          <div className="mt-4 flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-xs font-semibold text-red-600">
            <AlertCircle size={14} className="shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <Button
          className="mt-6 w-full justify-center gap-2 py-3.5 font-bold"
          loading={topup.isPending}
          onClick={submit}
        >
          <CreditCard size={16} />
          <span>Greiða með korti</span>
        </Button>

        <p className="mt-4 flex items-center justify-center gap-1.5 text-center text-xs text-slate-500">
          <Lock size={14} className="shrink-0 text-primary" />
          <span>Örugg greiðslugátt keyrð af Teya · Stuðningur við öll helstu kort</span>
        </p>
      </Card>

      {/* ===== INVOICE HISTORY =====
          Section title + subtitle copied verbatim from billing.dc.html. Table
          shape (Dagsetning / ... / Fjárhæð / VSK (24%) / Staða / Reikningur)
          and row treatment (22px vertical padding, hairline dividers, tabular
          numerals) follow the template with two honest substitutions:
            - "Herferð" (campaign name) → "Tegund" (Innborgun/Endurgreiðsla).
              A WalletTransaction has no campaign relation to display (its
              relatedId is a Teya session/campaign id depending on type, never
              fetched or joined against campaign data here) — showing the
              type that the pre-redesign table already surfaced is the honest
              equivalent, not a fabricated campaign name.
            - "Staða" (Greitt/Í vinnslu) always renders "Greitt". Ledger
              entries (apps/api/src/services/wallet.ts topUp/refundCampaign)
              are only ever written after the Teya payment/refund has already
              settled — there is no pending WalletTransaction state in this
              data model, so always-paid is factually true, not invented.
          The "VSK greitt á árinu" and "Eytt í mánuðinum" stat cards and the
          "Payment method" card from the template are both dropped:
            - Stat cards: this page's hooks (useWallet/useWalletTransactions/
              useAdvertiser) never fetch ad-spend or year-to-date VAT figures
              — computing them would need a new API call (not permitted) or
              would misrepresent wallet top-up totals as spend/VAT, which is
              exactly the kind of invented financial claim the task brief
              rules out on a money screen.
            - Payment method card: the template's "Kort •••• 4242 ... Notad
              til að fylla sjálfkrafa á veskið þitt" describes a stored card
              that auto-refills the wallet. No such stored payment method or
              auto-refill exists — every top-up is an explicit amount chosen
              above and paid via a fresh Teya checkout redirect. Reproducing
              this copy would be exactly the "nothing implying automatic/
              recurring charges that don't exist" case the brief calls out,
              so the section is omitted rather than adapted. */}
      <section>
        <h2 className="m-0 text-[19px] font-bold tracking-[-0.015em]">Reikningar</h2>
        <p className="m-0 mt-1.5 mb-5 max-w-[56ch] text-sm leading-relaxed text-slate-500">
          Löglegur VSK-reikningur fylgir hverri áfyllingu á veskið.
        </p>

        {transactions.isLoading ? (
          <div className="py-8 text-center text-xs font-semibold text-slate-400">
            Hleður færslusögu...
          </div>
        ) : !transactions.data || transactions.data.length === 0 ? (
          <div className="py-8 text-center text-xs font-semibold text-slate-400">
            Engar fyrri færslur fundust.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  <th className="border-b border-outline-variant py-3.5 pr-4 text-left text-xs font-semibold tracking-[0.08em] text-slate-500 uppercase">
                    Dagsetning
                  </th>
                  <th className="border-b border-outline-variant px-4 py-3.5 text-left text-xs font-semibold tracking-[0.08em] text-slate-500 uppercase">
                    Tegund
                  </th>
                  <th className="border-b border-outline-variant px-4 py-3.5 text-right text-xs font-semibold tracking-[0.08em] text-slate-500 uppercase">
                    Fjárhæð
                  </th>
                  <th className="border-b border-outline-variant px-4 py-3.5 text-right text-xs font-semibold tracking-[0.08em] text-slate-500 uppercase">
                    VSK ({Math.round(VAT_RATE * 100)}%)
                  </th>
                  <th className="border-b border-outline-variant px-4 py-3.5 text-left text-xs font-semibold tracking-[0.08em] text-slate-500 uppercase">
                    Staða
                  </th>
                  <th className="border-b border-outline-variant py-3.5 pl-4 text-right text-xs font-semibold tracking-[0.08em] text-slate-500 uppercase">
                    Reikningur
                  </th>
                </tr>
              </thead>
              <tbody>
                {transactions.data.map((tx, i) => {
                  const dateVal = new Date(tx.createdAt);
                  const dateFormatted = isNaN(dateVal.getTime())
                    ? 'Óþekkt'
                    : dateVal.toLocaleDateString('is-IS', {
                        day: '2-digit',
                        month: '2-digit',
                        year: 'numeric',
                      });
                  const isLast = i === transactions.data!.length - 1;
                  // VSK column: same platformFee/platformFeeVat formula as the
                  // top-up breakdown above, applied to this row's amount.
                  // Only meaningful for top-ups (the deposit that carries a
                  // brokerage fee); refunds show an em dash rather than a
                  // fabricated VAT figure.
                  const rowVat =
                    tx.type === 'topup'
                      ? Math.round(
                          Math.round(tx.amountIsk * (DEFAULT_PLATFORM_FEE_PERCENT / 100)) *
                            VAT_RATE,
                        )
                      : null;

                  return (
                    <tr
                      key={tx.id}
                      className={`transition-colors hover:bg-slate-50 ${isLast ? '' : 'border-b border-surface-container'}`}
                    >
                      <td className="py-[22px] pr-4 align-middle text-[15px] text-slate-700">
                        {dateFormatted}
                      </td>
                      <td className="px-4 py-[22px] align-middle">
                        <Badge variant={tx.type === 'topup' ? 'success' : 'pending'}>
                          {tx.type === 'topup' ? 'Innborgun' : 'Endurgreiðsla'}
                        </Badge>
                      </td>
                      <td className="px-4 py-[22px] text-right align-middle text-[15px] font-semibold text-slate-900 tabular-nums">
                        {formatIsk(tx.amountIsk)}
                      </td>
                      <td className="px-4 py-[22px] text-right align-middle text-[15px] text-slate-500 tabular-nums">
                        {rowVat !== null ? `${fmtNum(rowVat)} kr.` : '—'}
                      </td>
                      <td className="px-4 py-[22px] align-middle">
                        <Badge variant="success">Greitt</Badge>
                      </td>
                      <td className="py-[22px] pl-4 text-right align-middle">
                        <button
                          type="button"
                          onClick={() => printInvoice(tx)}
                          disabled={!advertiserQuery.data}
                          className="inline-flex cursor-pointer items-center gap-1.5 text-sm font-semibold text-primary transition hover:underline disabled:cursor-not-allowed disabled:text-slate-400 disabled:no-underline"
                        >
                          <FileText size={14} />
                          <span>Reikningur</span>
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
