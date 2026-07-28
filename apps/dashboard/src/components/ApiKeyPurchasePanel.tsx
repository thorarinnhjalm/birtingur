import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import { PillButton } from '@/components/ui/editorial';
import { formatIsk } from '@/lib/format';
import { useUpdateApiKeyPurchase, type ApiKeyRecord } from '@/hooks/useApiKeys';

/**
 * Per-key agentic-purchase configuration (PATCH /v1/api-keys/:id/purchase,
 * apps/api/src/routes/api-keys.ts). Only advertiser/both-scoped keys can
 * carry a purchase block — publisher-scoped keys reject the update
 * server-side, so this renders a disabled hint for them instead of a form.
 */
export function ApiKeyPurchasePanel({ apiKey }: { apiKey: ApiKeyRecord }) {
  const [editing, setEditing] = useState(false);
  const [enabled, setEnabled] = useState(apiKey.purchase?.enabled ?? false);
  const [monthlyCapIsk, setMonthlyCapIsk] = useState(
    apiKey.purchase?.monthlyCapIsk ? String(apiKey.purchase.monthlyCapIsk) : '',
  );
  const [autoApproveLimitIsk, setAutoApproveLimitIsk] = useState(
    apiKey.purchase?.autoApproveLimitIsk !== undefined
      ? String(apiKey.purchase.autoApproveLimitIsk)
      : '',
  );
  const [validationError, setValidationError] = useState<string | null>(null);

  const mutation = useUpdateApiKeyPurchase();

  if (apiKey.scope === 'publisher') {
    return (
      <span className="text-xs font-medium text-slate-400" title="Aðeins fyrir auglýsendalykla">
        Á ekki við
      </span>
    );
  }

  function startEditing() {
    setEnabled(apiKey.purchase?.enabled ?? false);
    setMonthlyCapIsk(apiKey.purchase?.monthlyCapIsk ? String(apiKey.purchase.monthlyCapIsk) : '');
    setAutoApproveLimitIsk(
      apiKey.purchase?.autoApproveLimitIsk !== undefined
        ? String(apiKey.purchase.autoApproveLimitIsk)
        : '',
    );
    setValidationError(null);
    mutation.reset();
    setEditing(true);
  }

  function validate(): { monthlyCapIsk: number; autoApproveLimitIsk: number } | null {
    if (!enabled) {
      // Disabling still requires two valid integers server-side (the schema
      // has no defaults) — fall back to the key's last known values, or 0/0
      // if purchase was never configured.
      return {
        monthlyCapIsk: apiKey.purchase?.monthlyCapIsk ?? 0,
        autoApproveLimitIsk: apiKey.purchase?.autoApproveLimitIsk ?? 0,
      };
    }

    const cap = Number(monthlyCapIsk);
    const limit = Number(autoApproveLimitIsk);

    if (monthlyCapIsk.trim() === '' || autoApproveLimitIsk.trim() === '') {
      setValidationError('Bæði mánaðarþak og sjálfvirknimörk þarf að fylla út til að virkja.');
      return null;
    }
    if (!Number.isInteger(cap) || cap <= 0) {
      setValidationError('Mánaðarþak þarf að vera heil króna, hærri en 0.');
      return null;
    }
    if (!Number.isInteger(limit) || limit < 0) {
      setValidationError('Sjálfvirknimörk þurfa að vera heil króna, 0 eða hærri.');
      return null;
    }
    if (limit > cap) {
      setValidationError('Sjálfvirknimörk mega ekki vera hærri en mánaðarþakið.');
      return null;
    }

    setValidationError(null);
    return { monthlyCapIsk: cap, autoApproveLimitIsk: limit };
  }

  function handleSave() {
    const parsed = validate();
    if (!parsed) return;

    mutation.mutate(
      { id: apiKey.id, enabled, ...parsed },
      {
        onSuccess: () => setEditing(false),
      },
    );
  }

  if (!editing) {
    const purchase = apiKey.purchase;
    return (
      <div className="flex flex-col items-start gap-1.5">
        {purchase?.enabled ? (
          <>
            <Badge variant="success">Virkt</Badge>
            <div className="text-[11px] font-semibold text-slate-500 leading-tight">
              <div>Mánaðarþak: {formatIsk(purchase.monthlyCapIsk)}</div>
              <div>Sjálfvirknimörk: {formatIsk(purchase.autoApproveLimitIsk)}</div>
              {purchase.monthToDateSpentIsk !== undefined && (
                <div>Notað í mánuði: {formatIsk(purchase.monthToDateSpentIsk)}</div>
              )}
            </div>
          </>
        ) : (
          <Badge variant="neutral">Óvirkt</Badge>
        )}
        <button
          type="button"
          onClick={startEditing}
          className="text-[11px] font-bold text-primary hover:underline"
        >
          Stilla
        </button>
      </div>
    );
  }

  return (
    <div className="w-72 space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
      <div className="space-y-1">
        <span className="block text-xs font-bold text-slate-700">Sjálfvirk kaup gervigreindar</span>
        <p className="text-[11px] leading-relaxed text-slate-500">
          Þegar þetta er virkt má gervigreindarfulltrúi sem notar þennan API lykil kaupa herferðir
          sjálfkrafa upp að mánaðarþaki. Kaup yfir sjálfvirknimörkum bíða samþykkis þíns í
          mælaborðinu.
        </p>
      </div>

      <div className="flex gap-2">
        <PillButton active={enabled} onClick={() => setEnabled(true)}>
          Virkt
        </PillButton>
        <PillButton active={!enabled} onClick={() => setEnabled(false)}>
          Óvirkt
        </PillButton>
      </div>

      {enabled && (
        <div className="space-y-2">
          <Input
            label="Mánaðarþak (kr.)"
            type="number"
            min="1"
            step="1"
            value={monthlyCapIsk}
            onChange={(e) => setMonthlyCapIsk(e.target.value)}
            disabled={mutation.isPending}
          />
          <Input
            label="Sjálfvirknimörk (kr.)"
            type="number"
            min="0"
            step="1"
            value={autoApproveLimitIsk}
            onChange={(e) => setAutoApproveLimitIsk(e.target.value)}
            disabled={mutation.isPending}
          />
        </div>
      )}

      {validationError && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-2 text-[11px] font-semibold text-red-600">
          {validationError}
        </div>
      )}
      {mutation.isError && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-2 text-[11px] font-semibold text-red-600">
          {(mutation.error as Error).message || 'Ekki tókst að vista kaupheimildir.'}
        </div>
      )}

      <div className="flex justify-end gap-2 pt-1">
        <Button
          type="button"
          variant="ghost"
          className="px-3 py-1.5 text-xs"
          onClick={() => setEditing(false)}
          disabled={mutation.isPending}
        >
          Hætta við
        </Button>
        <Button
          type="button"
          className="px-3 py-1.5 text-xs"
          loading={mutation.isPending}
          onClick={handleSave}
        >
          Vista
        </Button>
      </div>
    </div>
  );
}
