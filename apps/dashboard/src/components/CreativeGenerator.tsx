import { useMemo, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { apiFetch, ApiError } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Card } from '@/components/ui/Card';
import { StepIndicator } from '@/components/ui/editorial';
import { AlertCircle, Sparkles, Check, RefreshCw } from 'lucide-react';
import { IAB_STANDARD_SIZES } from '@ada/shared';
import type {
  Creative,
  GeneratedPreviewManifest,
  GeneratedCopyVariant,
  GeneratedTemplateId,
} from '@ada/shared';

/**
 * "Á ég enga borða?" flow — a guided, four-sub-step wizard (creative-wizard,
 * 2026-07-27 plan) that teaches while it executes: an advertiser with no
 * banner picks up the sizes their campaign actually needs, gets AI copy
 * suggestions, picks a look, and reviews the result before anything is
 * saved. Shared between CampaignCreate's "Efni" step (campaign mode — sizes
 * are informed by the categories already chosen in "Kaup") and
 * CreativeLibrary's standalone entry point (no category context — all IAB
 * sizes are shown instead), so both stay in sync with a single
 * implementation of the copy -> render -> confirm pipeline.
 *
 * Deliberately does NOT touch the existing file-upload path in either
 * caller — this is purely an additional entry point into the same
 * `Creative[]` shape both callers already know how to consume.
 */

type WizardStep = 'sizes' | 'texti' | 'utlit' | 'yfirferd';
const WIZARD_STEP_LABELS: Record<WizardStep, string> = {
  sizes: 'Stærðir',
  texti: 'Texti',
  utlit: 'Útlit',
  yfirferd: 'Yfirferð',
};
const WIZARD_STEPS: WizardStep[] = ['sizes', 'texti', 'utlit', 'yfirferd'];

// Length caps mirror GeneratedCopyVariantSchema in
// packages/shared/src/schemas/generated-preview.ts — edited copy is
// validated against the exact same limits server-side at
// /v1/creatives/generate/render, so these are duplicated here only for a
// live, responsive counter, not as the source of truth.
const HEADLINE_MAX = 30;
const SUBLINE_MAX = 60;
const CTA_MAX = 15;

function copyIsValid(c: GeneratedCopyVariant | null): boolean {
  if (!c) return false;
  return (
    c.headline.trim().length > 0 &&
    c.headline.length <= HEADLINE_MAX &&
    c.subline.trim().length > 0 &&
    c.subline.length <= SUBLINE_MAX &&
    c.cta.trim().length > 0 &&
    c.cta.length <= CTA_MAX
  );
}

function errMessage(err: unknown, fallback: string): string {
  if (err instanceof ApiError) return err.message || fallback;
  if (err instanceof Error) return err.message || fallback;
  return fallback;
}

// Fix 4 + Fix 9: `forecastShare` is `null` when the server's whole 7-day
// forecast window is empty (common at current scale) — showing "um 0%" on
// every size in that case would misleadingly read as "none of these sizes
// get any traffic" rather than "we don't have enough history yet", so the
// share clause is omitted entirely. When a share IS present but rounds down
// to a displayed 0% (a real, if small, positive share below 0.5%), "um 0%"
// is equally misleading in the opposite direction — it reads as exactly
// zero when it isn't — so that case reads "minna en 1%" instead.
function formatSizeInsight(s: { slotCount: number; forecastShare: number | null }): string {
  const base = `birtist á ${s.slotCount} plássum`;
  if (s.forecastShare === null) return base;
  const pct = Math.round(s.forecastShare * 100);
  const shareText = pct === 0 && s.forecastShare > 0 ? 'minna en 1%' : `um ${pct}%`;
  return `${base} — ${shareText} af áætluðum birtingum`;
}

// Local mirror of apps/api's CategorySizeForecast (services/inventory.ts) —
// the dashboard doesn't depend on apps/api internals, same pattern as
// useCategoryInventory.ts's own local CategoryInventory duplicate.
interface CategorySizeForecast {
  width: number;
  height: number;
  slotCount: number;
  // null when the server's 7-day forecast window is empty entirely (Fix 4) —
  // there's no meaningful share to show, so the UI falls back to slot counts
  // only instead of a misleading "um 0%" on every size.
  forecastShare: number | null;
}

interface SizeSpec {
  width: number;
  height: number;
}

function sizeKey(s: SizeSpec): string {
  return `${s.width}x${s.height}`;
}

const ALL_IAB_SIZES: SizeSpec[] = IAB_STANDARD_SIZES.map((s) => ({
  width: s.width,
  height: s.height,
}));

// B1 (defensive, client-side): the server (`getCategorySizeForecast`)
// already filters to IAB sizes only, but a slot can declare any 1..2000
// size (`seed.ts` itself seeds a 970x250 slot) — this intersect is a second,
// independent guard so a server regression can't dead-end the wizard at the
// "Útlit" step's IAB-only /generate/render call.
const IAB_SIZE_KEY_SET = new Set(ALL_IAB_SIZES.map(sizeKey));

interface CreativeGeneratorProps {
  /** Called once the advertiser has confirmed a variant and every requested
   * size has been created as a real Creative (reviewStatus pending/auto_approved). */
  onComplete: (creatives: Creative[]) => void;
  /** Optional escape hatch back to whatever the caller renders instead. */
  onCancel?: () => void;
  /** Categories already chosen in the campaign's "Kaup" step. When present
   * (non-empty), the "Stærðir" step fetches the real per-category size
   * forecast and only those sizes are rendered/confirmed. When absent
   * (CreativeLibrary's standalone mode), every IAB standard size is used
   * instead. */
  categories?: string[];
}

export function CreativeGenerator({ onComplete, onCancel, categories }: CreativeGeneratorProps) {
  const isCampaignMode = !!categories && categories.length > 0;

  const [wizardStep, setWizardStep] = useState<WizardStep>('sizes');
  const [landingUrl, setLandingUrl] = useState('https://');
  const [manifest, setManifest] = useState<GeneratedPreviewManifest | null>(null);
  const [selectedVariantId, setSelectedVariantId] = useState<string | null>(null);
  const [copyDraft, setCopyDraft] = useState<GeneratedCopyVariant | null>(null);
  const [templateId, setTemplateId] = useState<GeneratedTemplateId>('bold');
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sizesQuery = useQuery({
    queryKey: ['categories', 'sizes', categories],
    queryFn: () =>
      apiFetch<{ sizes: CategorySizeForecast[] }>(
        `/v1/categories/sizes?categories=${encodeURIComponent((categories ?? []).join(','))}`,
      ),
    enabled: isCampaignMode,
  });

  // Sizes actually needed for this campaign's categories — falls back to
  // every IAB size in standalone mode, and also if the category forecast
  // came back empty (no active slots yet) or errored, so the wizard never
  // dead-ends on a size step with nothing to render. B1 (defensive):
  // intersected with IAB_STANDARD_SIZES even though the server already
  // filters to IAB sizes — a non-IAB size reaching /generate/render 400s
  // and strands the wizard at "Útlit" with no way forward, so this is a
  // second, independent guard against that (server-side filter regressing,
  // or a future client bypassing the /categories/sizes endpoint).
  const neededSizes: SizeSpec[] = useMemo(() => {
    if (!isCampaignMode) return ALL_IAB_SIZES;
    if (sizesQuery.data && sizesQuery.data.sizes.length > 0) {
      const iabOnly = sizesQuery.data.sizes.filter((s) => IAB_SIZE_KEY_SET.has(sizeKey(s)));
      if (iabOnly.length > 0) {
        return iabOnly.map((s) => ({ width: s.width, height: s.height }));
      }
    }
    return ALL_IAB_SIZES;
  }, [isCampaignMode, sizesQuery.data]);

  const copyMutation = useMutation({
    mutationFn: (url: string) =>
      apiFetch<GeneratedPreviewManifest>('/v1/creatives/generate/copy', {
        method: 'POST',
        body: JSON.stringify({ landingUrl: url, variants: 3 }),
      }),
    onSuccess: (data) => {
      setManifest(data);
      setSelectedVariantId(null);
      setCopyDraft(null);
      setError(null);
    },
    onError: (err) => setError(errMessage(err, 'Ekki tókst að útbúa auglýsingatexta.')),
  });

  const renderMutation = useMutation({
    mutationFn: (input: {
      variantId: string;
      editedCopy?: GeneratedCopyVariant;
      sizes: SizeSpec[];
      templateId: GeneratedTemplateId;
    }) =>
      apiFetch<GeneratedPreviewManifest>('/v1/creatives/generate/render', {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    onSuccess: (data) => {
      setManifest(data);
      setError(null);
      setWizardStep('yfirferd');
    },
    onError: (err) => setError(errMessage(err, 'Ekki tókst að útbúa útlitið.')),
  });

  const confirmMutation = useMutation({
    mutationFn: (variantId: string) =>
      apiFetch<Creative[]>('/v1/creatives/generate/confirm', {
        method: 'POST',
        body: JSON.stringify({ variantId, landingUrl }),
      }),
    onSuccess: (creatives) => {
      setError(null);
      onComplete(creatives);
    },
    onError: (err) => setError(errMessage(err, 'Ekki tókst að vista auglýsingarnar.')),
  });

  const selectedVariant = manifest?.variants.find((v) => v.variantId === selectedVariantId);
  const isEditedCopy =
    !!copyDraft &&
    !!selectedVariant &&
    (copyDraft.headline !== selectedVariant.copy.headline ||
      copyDraft.subline !== selectedVariant.copy.subline ||
      copyDraft.cta !== selectedVariant.copy.cta);

  const handleGenerateCopy = () => {
    setError(null);
    if (!landingUrl.startsWith('https://') || landingUrl === 'https://') {
      setError('Sláðu inn gilda vefslóð sem hefst á https://');
      return;
    }
    copyMutation.mutate(landingUrl);
  };

  const handleSelectVariant = (variantId: string) => {
    const variant = manifest?.variants.find((v) => v.variantId === variantId);
    if (!variant) return;
    setSelectedVariantId(variantId);
    setCopyDraft({ ...variant.copy });
    setConfirmed(false);
  };

  const handleRender = () => {
    if (!selectedVariantId) return;
    setError(null);
    renderMutation.mutate({
      variantId: selectedVariantId,
      editedCopy: isEditedCopy && copyDraft ? copyDraft : undefined,
      sizes: neededSizes,
      templateId,
    });
  };

  const handleRegenerate = () => {
    if (!selectedVariantId) return;
    setError(null);
    renderMutation.mutate({
      variantId: selectedVariantId,
      editedCopy: isEditedCopy && copyDraft ? copyDraft : undefined,
      sizes: neededSizes,
      templateId,
    });
  };

  const handleConfirm = () => {
    if (!selectedVariantId) return;
    confirmMutation.mutate(selectedVariantId);
  };

  const currentStepIndex = WIZARD_STEPS.indexOf(wizardStep);
  const renderedVariant = manifest?.variants.find((v) => v.variantId === selectedVariantId);

  return (
    <div className="space-y-5">
      <div className="flex items-start gap-3 rounded-xl border border-primary/20 bg-primary/5 p-4">
        <Sparkles className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
        <div>
          <p className="text-sm font-bold text-slate-900">Á ég enga borða?</p>
          <p className="mt-1 text-xs leading-relaxed text-slate-600">
            Fjögur skref, hvert með stuttri útskýringu — þú velur og staðfestir áður en neitt er
            vistað.
          </p>
        </div>
      </div>

      <StepIndicator
        steps={WIZARD_STEPS.map((s) => WIZARD_STEP_LABELS[s])}
        current={currentStepIndex}
      />

      {error && (
        <div className="flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 p-3 text-xs font-semibold text-red-600">
          <AlertCircle size={14} className="shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* a. Stærðir — read-only insight, no user decision. */}
      {wizardStep === 'sizes' && (
        <div className="space-y-4">
          <p className="text-sm leading-relaxed text-slate-600">
            {isCampaignMode
              ? 'Flokkarnir sem þú valdir í Kaup-skrefinu ráða því á hvaða stærðum auglýsingin þín birtist — hér sérðu dreifinguna áður en nokkuð er búið til.'
              : 'Þetta eru allar staðlaðar auglýsingastærðir (IAB) — veldu flokka í herferðinni til að sjá nákvæma dreifingu fyrir hverja stærð.'}
          </p>

          {isCampaignMode && sizesQuery.isLoading && (
            <div className="space-y-2 py-2 animate-pulse">
              <div className="h-4 w-2/3 rounded bg-slate-200" />
              <div className="h-4 w-1/2 rounded bg-slate-200" />
            </div>
          )}

          {isCampaignMode && sizesQuery.isError && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs font-semibold text-amber-800">
              Ekki tókst að sækja stærðardreifingu fyrir valda flokka — notum allar staðlaðar
              stærðir í staðinn.
            </div>
          )}

          {isCampaignMode && !sizesQuery.isLoading && sizesQuery.data && (
            <>
              {sizesQuery.data.sizes.length === 0 ? (
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs font-semibold text-amber-800">
                  Engin virk pláss fundust í völdum flokkum ennþá — notum allar staðlaðar stærðir í
                  staðinn.
                </div>
              ) : (
                <ul className="space-y-2">
                  {sizesQuery.data.sizes.map((s) => (
                    <li
                      key={sizeKey(s)}
                      className="flex items-center justify-between rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm"
                    >
                      <span className="font-bold text-slate-900">
                        {s.width} × {s.height}
                      </span>
                      <span className="text-xs font-semibold text-slate-500">
                        {formatSizeInsight(s)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}

          {!isCampaignMode && (
            <ul className="space-y-2">
              {ALL_IAB_SIZES.map((s) => (
                <li
                  key={sizeKey(s)}
                  className="flex items-center justify-between rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm"
                >
                  <span className="font-bold text-slate-900">
                    {s.width} × {s.height}
                  </span>
                </li>
              ))}
            </ul>
          )}

          <div className="flex justify-between gap-3 border-t border-slate-100 pt-4">
            {onCancel && (
              <Button type="button" variant="ghost" onClick={onCancel}>
                Hætta við
              </Button>
            )}
            <Button
              type="button"
              className="ml-auto"
              disabled={isCampaignMode && sizesQuery.isLoading}
              onClick={() => setWizardStep('texti')}
            >
              Halda áfram →
            </Button>
          </div>
        </div>
      )}

      {/* b. Texti — URL in, copy variants out, pick + optionally edit. */}
      {wizardStep === 'texti' && (
        <div className="space-y-4">
          <p className="text-sm leading-relaxed text-slate-600">
            Settu inn vefslóð fyrirtækisins — við lesum innihald síðunnar og skrifum textatillögur
            fyrir þig á augabragði.
          </p>

          {!manifest && (
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
              <div className="flex-1">
                <Input
                  label="Vefslóð fyrirtækisins *"
                  type="url"
                  placeholder="https://fyrirtaeki.is"
                  value={landingUrl}
                  onChange={(e) => setLandingUrl(e.target.value)}
                />
              </div>
              <Button
                type="button"
                loading={copyMutation.isPending}
                disabled={!landingUrl.startsWith('https://') || landingUrl === 'https://'}
                onClick={handleGenerateCopy}
                className="gap-1.5"
              >
                <Sparkles size={15} />
                <span>Búa til tillögur</span>
              </Button>
            </div>
          )}

          {manifest && (
            <div className="space-y-4">
              <p className="text-sm font-semibold text-slate-700">Veldu eina útgáfu:</p>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {manifest.variants.map((variant, i) => {
                  const isSelected = selectedVariantId === variant.variantId;
                  return (
                    <Card
                      key={variant.variantId}
                      className={
                        isSelected
                          ? 'cursor-pointer border-2 border-primary p-4'
                          : 'cursor-pointer border p-4 hover:border-primary/40'
                      }
                      onClick={() => handleSelectVariant(variant.variantId)}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-xs font-bold uppercase tracking-wide text-primary">
                          Afbrigði {i + 1}
                        </p>
                        {isSelected && (
                          <span className="rounded-full bg-primary p-1 text-white">
                            <Check size={12} />
                          </span>
                        )}
                      </div>
                      <p className="mt-2 text-sm font-bold text-slate-900">
                        {variant.copy.headline}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">{variant.copy.subline}</p>
                      <p className="mt-2 text-[11px] font-semibold text-slate-400">
                        {variant.copy.cta}
                      </p>
                    </Card>
                  );
                })}
              </div>

              {selectedVariantId && copyDraft && (
                <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
                  <p className="text-xs font-bold text-slate-700">
                    Breyta texta (valfrjálst) — sami texti er notaður á öllum stærðum
                  </p>
                  <div className="space-y-1">
                    <Input
                      label="Fyrirsögn *"
                      value={copyDraft.headline}
                      maxLength={HEADLINE_MAX}
                      onChange={(e) =>
                        setCopyDraft({
                          ...copyDraft,
                          headline: e.target.value.slice(0, HEADLINE_MAX),
                        })
                      }
                    />
                    <p className="text-right text-[11px] text-slate-400">
                      {copyDraft.headline.length}/{HEADLINE_MAX}
                    </p>
                  </div>
                  <div className="space-y-1">
                    <Input
                      label="Undirtexti *"
                      value={copyDraft.subline}
                      maxLength={SUBLINE_MAX}
                      onChange={(e) =>
                        setCopyDraft({
                          ...copyDraft,
                          subline: e.target.value.slice(0, SUBLINE_MAX),
                        })
                      }
                    />
                    <p className="text-right text-[11px] text-slate-400">
                      {copyDraft.subline.length}/{SUBLINE_MAX}
                    </p>
                  </div>
                  <div className="space-y-1">
                    <Input
                      label="Hnappatexti (CTA) *"
                      value={copyDraft.cta}
                      maxLength={CTA_MAX}
                      onChange={(e) =>
                        setCopyDraft({ ...copyDraft, cta: e.target.value.slice(0, CTA_MAX) })
                      }
                    />
                    <p className="text-right text-[11px] text-slate-400">
                      {copyDraft.cta.length}/{CTA_MAX}
                    </p>
                  </div>
                </div>
              )}

              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  className="text-xs"
                  onClick={() => {
                    setManifest(null);
                    setSelectedVariantId(null);
                    setCopyDraft(null);
                  }}
                >
                  Reyna aðra slóð
                </Button>
              </div>
            </div>
          )}

          <div className="flex justify-between gap-3 border-t border-slate-100 pt-4">
            <Button type="button" variant="ghost" onClick={() => setWizardStep('sizes')}>
              Til baka
            </Button>
            <Button
              type="button"
              disabled={!selectedVariantId || !copyIsValid(copyDraft)}
              onClick={() => setWizardStep('utlit')}
            >
              Halda áfram í útlit →
            </Button>
          </div>
        </div>
      )}

      {/* c. Útlit — template choice + render (only the needed sizes). */}
      {wizardStep === 'utlit' && (
        <div className="space-y-4">
          <p className="text-sm leading-relaxed text-slate-600">
            Veldu hvort útlitið á að vera dökkt og áberandi eða létt og einfalt — við teiknum
            bakgrunn og allar völdu stærðirnar í einu.
          </p>

          <div className="grid grid-cols-2 gap-4">
            <Card
              className={
                templateId === 'bold'
                  ? 'cursor-pointer border-2 border-primary p-4'
                  : 'cursor-pointer border p-4 hover:border-primary/40'
              }
              onClick={() => setTemplateId('bold')}
            >
              <div className="flex h-16 items-center justify-center rounded-md bg-slate-900">
                <span className="text-xs font-extrabold uppercase tracking-wide text-white">
                  Dökkt
                </span>
              </div>
              <p className="mt-2 text-sm font-bold text-slate-900">Áberandi (bold)</p>
              <p className="text-xs text-slate-500">Dökkur bakgrunnur, stór texti.</p>
            </Card>
            <Card
              className={
                templateId === 'light'
                  ? 'cursor-pointer border-2 border-primary p-4'
                  : 'cursor-pointer border p-4 hover:border-primary/40'
              }
              onClick={() => setTemplateId('light')}
            >
              <div className="flex h-16 items-center justify-center rounded-md border border-slate-200 bg-white">
                <span className="text-xs font-extrabold uppercase tracking-wide text-slate-900">
                  Ljóst
                </span>
              </div>
              <p className="mt-2 text-sm font-bold text-slate-900">Létt (light)</p>
              <p className="text-xs text-slate-500">Ljós bakgrunnur, einfalt yfirbragð.</p>
            </Card>
          </div>

          {renderMutation.isPending && (
            <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 text-xs font-semibold text-primary">
              Bý til bakgrunn og teikna borðana — tekur allt að mínútu.
            </div>
          )}

          <div className="flex justify-between gap-3 border-t border-slate-100 pt-4">
            <Button type="button" variant="ghost" onClick={() => setWizardStep('texti')}>
              Til baka
            </Button>
            <Button type="button" loading={renderMutation.isPending} onClick={handleRender}>
              Útbúa útlit →
            </Button>
          </div>
        </div>
      )}

      {/* d. Yfirferð — per-size previews, regenerate, responsibility check, confirm. */}
      {wizardStep === 'yfirferd' && (
        <div className="space-y-4">
          <p className="text-sm leading-relaxed text-slate-600">
            Skoðaðu útkomuna í hverri stærð fyrir sig — þú getur endurgert útlitið eða haldið áfram
            þegar þú ert sátt(ur).
          </p>

          {renderMutation.isPending && (
            <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 text-xs font-semibold text-primary">
              Bý til bakgrunn og teikna borðana — tekur allt að mínútu.
            </div>
          )}

          {renderedVariant && renderedVariant.images.length > 0 && (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {renderedVariant.images.map((img) => (
                <Card key={img.sizeKey} className="p-3">
                  <div className="relative overflow-hidden rounded-lg bg-slate-100">
                    <img
                      src={img.url}
                      alt={`${renderedVariant.copy.headline} (${img.sizeKey})`}
                      className="w-full object-contain"
                    />
                  </div>
                  <p className="mt-2 text-xs font-bold text-slate-700">{img.sizeKey}</p>
                </Card>
              ))}
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="secondary"
              className="gap-1.5 text-xs"
              loading={renderMutation.isPending}
              onClick={handleRegenerate}
            >
              <RefreshCw size={13} />
              <span>Endurgera útlit</span>
            </Button>
          </div>
          <p className="text-[11px] font-semibold text-slate-400">
            Endurgerð notar eitt af 10 leyfðum útlitsgerðum dagsins.
          </p>

          <label className="flex items-start gap-2.5 rounded-lg border border-amber-200 bg-amber-50 p-3.5 text-xs font-semibold text-amber-900">
            <input
              type="checkbox"
              className="mt-0.5"
              checked={confirmed}
              onChange={(e) => setConfirmed(e.target.checked)}
            />
            <span>
              Þú berð ábyrgð á innihaldi auglýsingarinnar — yfirfarðu textann og myndina áður en þú
              heldur áfram. Auglýsingin fer í venjulegt yfirferðarferli áður en hún birtist.
            </span>
          </label>

          <div className="flex justify-between gap-3 border-t border-slate-100 pt-4">
            <Button type="button" variant="ghost" onClick={() => setWizardStep('utlit')}>
              Til baka
            </Button>
            <Button
              type="button"
              disabled={!confirmed || renderMutation.isPending}
              loading={confirmMutation.isPending}
              onClick={handleConfirm}
            >
              Staðfesta og vista auglýsingu
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
