import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Card } from '@/components/ui/Card';
import { PillButton } from '@/components/ui/editorial';
import { AlertCircle, Sparkles, Check } from 'lucide-react';
import type { Creative, GeneratedPreviewManifest, GeneratedPreviewVariant } from '@ada/shared';

/**
 * "Á ég enga borða?" flow — an advertiser with no banner pastes their
 * landing-page URL and gets AI-generated banner previews to pick from,
 * across every IAB size. Shared between CampaignCreate's step-2 branch and
 * CreativeLibrary's empty state / entry point so both stay in sync with a
 * single implementation of the generate -> preview -> confirm pipeline.
 *
 * Deliberately does NOT touch the existing file-upload path in either
 * caller — this is purely an additional entry point into the same
 * `Creative[]` shape both callers already know how to consume.
 */

// Representative size shown in the preview grid — 300x250 (Medium
// Rectangle) is the most common ad size and gives a legible preview at
// card width; all sizes are still generated and confirmed together.
const REPRESENTATIVE_SIZE_KEY = '300x250';

interface CreativeGeneratorProps {
  /** Called once the advertiser has confirmed a variant and every size has
   * been created as a real Creative (reviewStatus pending/auto_approved). */
  onComplete: (creatives: Creative[]) => void;
  /** Optional escape hatch back to whatever the caller renders instead. */
  onCancel?: () => void;
}

export function CreativeGenerator({ onComplete, onCancel }: CreativeGeneratorProps) {
  const [landingUrl, setLandingUrl] = useState('https://');
  const [manifest, setManifest] = useState<GeneratedPreviewManifest | null>(null);
  const [selectedVariantId, setSelectedVariantId] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const generateMutation = useMutation({
    mutationFn: (url: string) =>
      apiFetch<GeneratedPreviewManifest>('/v1/creatives/generate', {
        method: 'POST',
        body: JSON.stringify({ landingUrl: url, variants: 2 }),
      }),
    onSuccess: (data) => {
      setManifest(data);
      setSelectedVariantId(null);
      setError(null);
    },
    onError: (err: any) => {
      setError(err.message || 'Ekki tókst að útbúa auglýsingatillögur.');
    },
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
    onError: (err: any) => {
      setError(err.message || 'Ekki tókst að vista auglýsingarnar.');
    },
  });

  const handleGenerate = () => {
    setError(null);
    if (!landingUrl.startsWith('https://') || landingUrl === 'https://') {
      setError('Sláðu inn gilda vefslóð sem hefst á https://');
      return;
    }
    generateMutation.mutate(landingUrl);
  };

  const handleConfirm = () => {
    if (!selectedVariantId) return;
    confirmMutation.mutate(selectedVariantId);
  };

  const representativeImage = (variant: GeneratedPreviewVariant) =>
    variant.images.find((img) => img.sizeKey === REPRESENTATIVE_SIZE_KEY) ?? variant.images[0];

  return (
    <div className="space-y-5">
      <div className="flex items-start gap-3 rounded-xl border border-primary/20 bg-primary/5 p-4">
        <Sparkles className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
        <div>
          <p className="text-sm font-bold text-slate-900">Á ég enga borða?</p>
          <p className="mt-1 text-xs leading-relaxed text-slate-600">
            Settu inn vefslóðina þína og við útbúum auglýsingatillögur í öllum stærðum sjálfkrafa,
            byggt á innihaldi síðunnar. Þú velur og staðfestir áður en neitt er vistað.
          </p>
        </div>
      </div>

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
            loading={generateMutation.isPending}
            disabled={!landingUrl.startsWith('https://') || landingUrl === 'https://'}
            onClick={handleGenerate}
            className="gap-1.5"
          >
            <Sparkles size={15} />
            <span>Búa til tillögur</span>
          </Button>
          {onCancel && (
            <Button type="button" variant="ghost" onClick={onCancel}>
              Hætta við
            </Button>
          )}
        </div>
      )}

      {error && (
        <div className="flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 p-3 text-xs font-semibold text-red-600">
          <AlertCircle size={14} className="shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {manifest && (
        <div className="space-y-4">
          <p className="text-sm font-semibold text-slate-700">Veldu eina útgáfu:</p>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {manifest.variants.map((variant) => {
              const image = representativeImage(variant);
              const isSelected = selectedVariantId === variant.variantId;
              return (
                <Card
                  key={variant.variantId}
                  className={
                    isSelected
                      ? 'cursor-pointer border-2 border-primary p-3'
                      : 'cursor-pointer border p-3 hover:border-primary/40'
                  }
                  onClick={() => {
                    setSelectedVariantId(variant.variantId);
                    setConfirmed(false);
                  }}
                >
                  <div className="relative overflow-hidden rounded-lg bg-slate-100">
                    {image && (
                      <img
                        src={image.url}
                        alt={variant.copy.headline}
                        className="w-full object-contain"
                      />
                    )}
                    {isSelected && (
                      <div className="absolute right-2 top-2 rounded-full bg-primary p-1 text-white">
                        <Check size={13} />
                      </div>
                    )}
                  </div>
                  <div className="mt-3 space-y-1">
                    <p className="text-sm font-bold text-slate-900">{variant.copy.headline}</p>
                    <p className="text-xs text-slate-500">{variant.copy.subline}</p>
                  </div>
                  <p className="mt-2 text-[11px] text-slate-400">
                    Búið til í {variant.images.length} stærðum:{' '}
                    {variant.images.map((i) => i.sizeKey).join(' · ')}
                  </p>
                </Card>
              );
            })}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {manifest.variants.map((v, i) => (
              <PillButton
                key={v.variantId}
                active={selectedVariantId === v.variantId}
                onClick={() => {
                  setSelectedVariantId(v.variantId);
                  setConfirmed(false);
                }}
              >
                Afbrigði {i + 1}
              </PillButton>
            ))}
            <Button
              type="button"
              variant="ghost"
              className="ml-auto text-xs"
              onClick={() => {
                setManifest(null);
                setSelectedVariantId(null);
              }}
            >
              Reyna aðra slóð
            </Button>
          </div>

          {selectedVariantId && (
            <label className="flex items-start gap-2.5 rounded-lg border border-amber-200 bg-amber-50 p-3.5 text-xs font-semibold text-amber-900">
              <input
                type="checkbox"
                className="mt-0.5"
                checked={confirmed}
                onChange={(e) => setConfirmed(e.target.checked)}
              />
              <span>
                Þú berð ábyrgð á innihaldi auglýsingarinnar — yfirfarðu textann og myndina áður en
                þú heldur áfram. Auglýsingin fer í venjulegt yfirferðarferli áður en hún birtist.
              </span>
            </label>
          )}

          <div className="flex justify-end gap-3 border-t border-slate-100 pt-4">
            <Button
              type="button"
              disabled={!selectedVariantId || !confirmed}
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
