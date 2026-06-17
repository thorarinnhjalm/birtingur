import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTopUp, useWallet, useWalletTransactions } from '@/hooks/useWallet';
import { useAdvertiser } from '@/hooks/useAdvertiser';
import { useAuth } from '@/lib/auth-context';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { formatIsk } from '@/lib/format';
import { VAT_RATE, DEFAULT_PLATFORM_FEE_PERCENT } from '@ada/shared';
import {
  AlertCircle,
  CreditCard,
  ShieldCheck,
  CheckCircle,
  AlertTriangle,
  FileText,
} from 'lucide-react';

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

    const txAmount = tx.amountIsk;
    const deposit = Math.round(txAmount * 0.8);
    const fee = Math.round(txAmount * 0.2);
    const vat = Math.round(fee * 0.24);

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
            <h1>Greiðslukvittun / Reikningur</h1>
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
              <td>Innborgun á veltureikning hjá Birtingi (Umboðssala - VSK-frítt)</td>
              <td class="right">1</td>
              <td class="right">${deposit.toLocaleString('is-IS')} kr.</td>
              <td class="right">${deposit.toLocaleString('is-IS')} kr.</td>
            </tr>
            <tr>
              <td>Umsýslu- og bókunarþóknun Birtingar (20% af innborgun)</td>
              <td class="right">1</td>
              <td class="right">${fee.toLocaleString('is-IS')} kr.</td>
              <td class="right">${fee.toLocaleString('is-IS')} kr.</td>
            </tr>
          </tbody>
        </table>

        <div class="summary">
          <div class="summary-row">
            <span>VSK-frjáls velta (Umboðssala 80%):</span>
            <span>${deposit.toLocaleString('is-IS')} kr.</span>
          </div>
          <div class="summary-row">
            <span>Gjaldstofn VSK (Þóknun 20%):</span>
            <span>${fee.toLocaleString('is-IS')} kr.</span>
          </div>
          <div class="summary-row">
            <span>Virðisaukaskattur (24% af þóknun):</span>
            <span>${vat.toLocaleString('is-IS')} kr.</span>
          </div>
          <div class="summary-row total">
            <span>Greidd heildarupphæð:</span>
            <span>${txAmount.toLocaleString('is-IS')} kr.</span>
          </div>
        </div>

        <div class="footnote">
          * Samkvæmt 10. gr. laga nr. 50/1988 um virðisaukaskatt og sérreglum um umboðssölu er innlögn á veltureikning til auglýsingakaupa undanþegin virðisaukaskatti við innborgun. Birtingur ehf. innheimtir virðisaukaskatt (24%) eingöngu af eigin bókunarþóknun (20% af ráðstafaðri upphæð) jafnóðum og herferðir eru birtar. Þessi reikningur þjónar som staðfesting á kortagreiðslu og sundurliðun á áætlaðri þóknun og sköttum.
        </div>
      </body>
      </html>
    `;

    invoiceWindow.document.write(htmlContent);
    invoiceWindow.document.close();
  }

  return (
    <div className="max-w-xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Setja inn inneign</h1>
        <p className="text-slate-500 text-sm font-medium mt-1">
          Bættu inneign á auglýsendaaðganginn þinn til að halda herferðum gangandi.
        </p>
      </div>

      {success && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800 flex items-start gap-3 shadow-sm">
          <CheckCircle className="text-emerald-500 shrink-0 mt-0.5" size={18} />
          <div>
            <h4 className="font-bold text-emerald-900 text-sm">Innborgun tókst!</h4>
            <p className="text-emerald-700 text-xs font-medium mt-0.5">
              Greiðslan hefur verið staðfest og inneignin hefur verið uppfærð á aðgangi þínum.
            </p>
          </div>
        </div>
      )}

      {cancelled && (
        <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl text-amber-800 flex items-start gap-3 shadow-sm">
          <AlertTriangle className="text-amber-500 shrink-0 mt-0.5" size={18} />
          <div>
            <h4 className="font-bold text-amber-900 text-sm">Hætt við greiðslu</h4>
            <p className="text-amber-700 text-xs font-medium mt-0.5">
              Hætt var við greiðsluferlið. Engir peningar voru dregnir af kortinu þínu.
            </p>
          </div>
        </div>
      )}

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
            <span>Innlögn á veltureikning (VSK-frítt)</span>
            <span>{formatIsk(amount)}</span>
          </div>
          <div className="flex justify-between text-slate-500 font-medium text-xs pl-2 border-l-2 border-slate-200">
            <span>Áætluð þóknun Birtingar (20%)</span>
            <span>{formatIsk(platformFee)}</span>
          </div>
          <div className="flex justify-between text-slate-500 font-medium text-xs pl-2 border-l-2 border-slate-200">
            <span>Áætlaður VSK af þóknun (24%)</span>
            <span>{formatIsk(platformFeeVat)}</span>
          </div>
          <div className="flex justify-between text-slate-900 font-extrabold text-base border-t border-slate-100 pt-3">
            <span>Heildargreiðsla</span>
            <span>{formatIsk(amount)}</span>
          </div>
          <p className="text-[10px] text-slate-400 font-medium leading-relaxed mt-2">
            * Samkvæmt lögum um umboðssölu er innlögnin sjálf VSK-frjáls innlögn á veltureikning.
            Virðisaukaskattur (24%) reiknast eingöngu af þjónustuþóknun Birtingar (20%) þegar
            auglýsingar eru sýndar.
          </p>
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

      {/* Transaction History & VAT Invoices Card */}
      <Card className="p-6">
        <h3 className="text-base font-bold text-slate-900 mb-4 flex items-center gap-2">
          <span className="material-symbols-outlined text-primary text-xl">history</span>
          Færslusaga & VSK Reikningar
        </h3>

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
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-100 text-slate-400 uppercase font-bold tracking-wider">
                  <th className="py-3 px-2">Dagsetning</th>
                  <th className="py-3 px-2">Tegund</th>
                  <th className="py-3 px-2 text-right">Upphæð</th>
                  <th className="py-3 px-2 text-center">Aðgerð</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-semibold text-slate-700">
                {transactions.data.map((tx) => {
                  const dateVal = new Date(tx.createdAt);
                  const dateFormatted = isNaN(dateVal.getTime())
                    ? 'Óþekkt'
                    : dateVal.toLocaleDateString('is-IS', {
                        day: '2-digit',
                        month: '2-digit',
                        year: 'numeric',
                      });

                  return (
                    <tr key={tx.id} className="hover:bg-slate-50/50 transition">
                      <td className="py-3.5 px-2">{dateFormatted}</td>
                      <td className="py-3.5 px-2">
                        {tx.type === 'topup' ? (
                          <span className="text-emerald-700 bg-emerald-50 px-2 py-1 rounded-md text-[10px] font-bold">
                            Innborgun
                          </span>
                        ) : (
                          <span className="text-amber-700 bg-amber-50 px-2 py-1 rounded-md text-[10px] font-bold">
                            Endurgreiðsla
                          </span>
                        )}
                      </td>
                      <td className="py-3.5 px-2 text-right font-bold text-slate-900">
                        {formatIsk(tx.amountIsk)}
                      </td>
                      <td className="py-3.5 px-2 text-center">
                        <button
                          type="button"
                          onClick={() => printInvoice(tx)}
                          disabled={!advertiserQuery.data}
                          className="inline-flex items-center gap-1 text-[11px] font-bold text-sky-600 hover:text-sky-700 cursor-pointer bg-sky-50 hover:bg-sky-100 px-2.5 py-1.5 rounded-lg border border-sky-150 transition disabled:opacity-50 disabled:pointer-events-none"
                        >
                          <FileText size={12} />
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
      </Card>
    </div>
  );
}
