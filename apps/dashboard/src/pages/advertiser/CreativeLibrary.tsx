import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Input } from '@/components/ui/Input';
import { LoadingState } from '@/components/ui/LoadingState';
import { EmptyState } from '@/components/ui/EmptyState';
import { EditorialH1 } from '@/components/ui/editorial';
import {
  AlertCircle,
  Image as ImageIcon,
  Plus,
  ExternalLink,
  Upload,
  Edit2,
  Trash2,
  Sparkles,
} from 'lucide-react';
import type { Creative } from '@ada/shared';
import { useBulkCreativeStats } from '@/hooks/useCampaigns';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { storage } from '@/lib/firebase';
import { useAdvertiser } from '@/hooks/useAdvertiser';
import { CreativeGenerator } from '@/components/CreativeGenerator';

// Filter-tab grouping — creative-library.dc.html's groupOf() operates on mock
// campaign-like statuses (active / review|pending / draft|paused|rejected).
// The real Creative type has no "active" state of its own — only
// reviewStatus: pending | auto_approved | manual_approved | rejected (see
// packages/shared/src/schemas/advertiser.ts). Mapped the closest honest
// equivalent: approved creatives are usable ("Virkar"), pending is the
// template's review/progress group, rejected is "Óvirkar". Same style of
// best-effort status mapping as CampaignList.tsx's groupOf().
type FilterKey = 'all' | 'active' | 'progress' | 'inactive';
function groupOf(status: Creative['reviewStatus']): 'active' | 'progress' | 'inactive' {
  if (status === 'auto_approved' || status === 'manual_approved') return 'active';
  if (status === 'pending') return 'progress';
  return 'inactive'; // rejected
}

export default function CreativeLibrary() {
  const qc = useQueryClient();
  const [showAddModal, setShowAddModal] = useState(false);
  const [showGenerateModal, setShowGenerateModal] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { data: bulkStats } = useBulkCreativeStats();
  const { data: advertiser } = useAdvertiser();

  // Search + filter — not in the pre-redesign page, added to match
  // creative-library.dc.html's search box and status pills. Both are
  // client-side filters over the already-fetched `creatives` list below, so
  // no new API calls are introduced.
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<FilterKey>('all');

  // Upload Form State
  const [clickUrl, setClickUrl] = useState('https://');
  const [imageUrl, setImageUrl] = useState('');
  const [imageWidth, setImageWidth] = useState(300);
  const [imageHeight, setImageHeight] = useState(250);
  const [ocrTextHint, setOcrTextHint] = useState('');
  const [uploading, setUploading] = useState(false);
  const [selectedFile, setSelectedFile] = useState<any>(null);

  // Fetch creatives
  const { data: creatives, isLoading } = useQuery({
    queryKey: ['creatives'],
    queryFn: () => apiFetch<Creative[]>('/v1/creatives'),
  });

  // Create Creative Mutation
  const createCreativeMutation = useMutation({
    mutationFn: (input: {
      imageUrl: string;
      width: number;
      height: number;
      clickUrl: string;
      ocrTextHint?: string;
    }) =>
      apiFetch<Creative>('/v1/creatives', {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['creatives'] });
      setShowAddModal(false);
      // Reset form
      setClickUrl('https://');
      setImageUrl('');
      setImageWidth(300);
      setImageHeight(250);
      setOcrTextHint('');
      setSelectedFile(null);
    },
  });

  // Edit Creative State & Mutation
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingCreative, setEditingCreative] = useState<Creative | null>(null);
  const [editClickUrl, setEditClickUrl] = useState('https://');
  const [editOcrTextHint, setEditOcrTextHint] = useState('');
  const [editError, setEditError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);

  const editCreativeMutation = useMutation({
    mutationFn: ({
      id,
      clickUrl,
      ocrTextHint,
    }: {
      id: string;
      clickUrl: string;
      ocrTextHint?: string;
    }) =>
      apiFetch<Creative>(`/v1/creatives/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ clickUrl, ocrTextHint }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['creatives'] });
      setShowEditModal(false);
      setEditingCreative(null);
      setEditClickUrl('https://');
      setEditOcrTextHint('');
      setEditError(null);
    },
  });

  const handleStartEdit = (creative: Creative) => {
    setEditingCreative(creative);
    setEditClickUrl(creative.clickUrl);
    setEditOcrTextHint(creative.ocrTextHint || '');
    setEditError(null);
    setShowEditModal(true);
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setEditError(null);

    if (!editClickUrl.startsWith('https://')) {
      setEditError('Slóð smella verður að byrja á https://');
      return;
    }

    if (!editingCreative) return;

    setEditing(true);
    try {
      await editCreativeMutation.mutateAsync({
        id: editingCreative.id,
        clickUrl: editClickUrl,
        ocrTextHint: editOcrTextHint || undefined,
      });
    } catch (err: any) {
      setEditError(err.message || 'Ekki tókst að uppfæra auglýsinguna.');
    } finally {
      setEditing(false);
    }
  };

  // Delete State & Mutation
  const [deleteConfirmCreative, setDeleteConfirmCreative] = useState<Creative | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const deleteCreativeMutation = useMutation({
    mutationFn: (id: string) =>
      apiFetch<void>(`/v1/creatives/${id}`, {
        method: 'DELETE',
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['creatives'] });
      setDeleteConfirmCreative(null);
      setDeleteError(null);
    },
  });

  const handleDeleteSubmit = async () => {
    if (!deleteConfirmCreative) return;
    setDeleteError(null);
    setDeleting(true);
    try {
      await deleteCreativeMutation.mutateAsync(deleteConfirmCreative.id);
    } catch (err: any) {
      setDeleteError(err.message || 'Ekki tókst að eyða auglýsingunni.');
    } finally {
      setDeleting(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 2 * 1024 * 1024) {
      setError('Skrá verður að vera undir 2 MB');
      return;
    }

    setSelectedFile(file);
    const objectUrl = window.URL.createObjectURL(file);
    setImageUrl(objectUrl);

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        setImageWidth(img.width);
        setImageHeight(img.height);
      };
      img.src = event.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

  const handleUploadSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!clickUrl.startsWith('https://')) {
      setError('Click URL verður að byrja á https://');
      return;
    }

    if (!selectedFile) {
      setError('Vinsamlegast veldu mynd til að hlaða upp');
      return;
    }

    if (!advertiser) {
      setError('Prófíll auglýsanda fannst ekki. Vinsamlegast reyndu aftur.');
      return;
    }

    setUploading(true);
    try {
      // 1. Upload file to Firebase Storage
      const fileExt = selectedFile.name.split('.').pop() || 'png';
      const filename = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}.${fileExt}`;
      const storageRef = ref(storage, `creatives/${advertiser.id}/${filename}`);
      const snapshot = await uploadBytes(storageRef, selectedFile);
      const downloadUrl = await getDownloadURL(snapshot.ref);

      // 2. Submit creative to API with the uploaded image's URL
      await createCreativeMutation.mutateAsync({
        imageUrl: downloadUrl,
        width: imageWidth,
        height: imageHeight,
        clickUrl,
        ocrTextHint: ocrTextHint || undefined,
      });
    } catch (err: any) {
      setError(err.message || 'Ekki tókst að hlaða upp eða skrá auglýsinguna.');
    } finally {
      setUploading(false);
    }
  };

  if (isLoading) return <LoadingState />;

  // Pre-redesign page treated "no creatives yet" as its own onboarding empty
  // state. Kept as an early return (same pattern as CampaignList.tsx) so the
  // search/filter row never renders over an empty library.
  if (!creatives || creatives.length === 0) {
    return (
      <div className="w-full flex flex-col gap-6">
        <EditorialH1>Auglýsingasafn</EditorialH1>
        <EmptyState
          icon={<ImageIcon size={44} />}
          title="Engar auglýsingar í safninu"
          description="Hlaða upp fyrsta auglýsingaborðinu þínu til að geta valið það inn í herferðir — eða láttu gervigreindina útbúa tillögur ef þú átt enga borða."
          action={
            <div className="flex flex-wrap justify-center gap-3">
              <Button onClick={() => setShowAddModal(true)}>Hlaða upp nýrri auglýsingu</Button>
              <Button
                variant="secondary"
                onClick={() => setShowGenerateModal(true)}
                className="gap-1.5"
              >
                <Sparkles size={15} />
                <span>Á ég enga borða?</span>
              </Button>
            </div>
          }
        />
        {showAddModal && (
          <AddCreativeModal
            clickUrl={clickUrl}
            setClickUrl={setClickUrl}
            imageUrl={imageUrl}
            imageWidth={imageWidth}
            imageHeight={imageHeight}
            ocrTextHint={ocrTextHint}
            setOcrTextHint={setOcrTextHint}
            error={error}
            uploading={uploading}
            onFileChange={handleFileChange}
            onSubmit={handleUploadSubmit}
            onClose={() => setShowAddModal(false)}
          />
        )}
        {showGenerateModal && (
          <GenerateCreativeModal
            onClose={() => setShowGenerateModal(false)}
            onComplete={() => {
              qc.invalidateQueries({ queryKey: ['creatives'] });
              setShowGenerateModal(false);
            }}
          />
        )}
      </div>
    );
  }

  const counts = { all: creatives.length, active: 0, progress: 0, inactive: 0 };
  creatives.forEach((c) => {
    counts[groupOf(c.reviewStatus)]++;
  });

  // Search matches the only free-text fields Creative actually has (id,
  // click URL, OCR text hint) — the template's mock search matches
  // headline/category, neither of which exists on the real Creative type.
  const q = query.trim().toLowerCase();
  const visible = creatives.filter((c) => {
    const matchesFilter = filter === 'all' || groupOf(c.reviewStatus) === filter;
    const matchesQuery =
      !q ||
      c.id.toLowerCase().includes(q) ||
      c.clickUrl.toLowerCase().includes(q) ||
      (c.ocrTextHint ?? '').toLowerCase().includes(q);
    return matchesFilter && matchesQuery;
  });

  const tabs: { key: FilterKey; label: string; count: number }[] = [
    { key: 'all', label: 'Allar', count: counts.all },
    { key: 'active', label: 'Virkar', count: counts.active },
    { key: 'progress', label: 'Í vinnslu', count: counts.progress },
    { key: 'inactive', label: 'Óvirkar', count: counts.inactive },
  ];

  return (
    <div
      className="w-full"
      style={{ display: 'flex', flexDirection: 'column', gap: 'clamp(32px,4vw,48px)' }}
    >
      {/* ===== PAGE HEADER ===== */}
      <header className="flex flex-wrap items-end justify-between gap-5">
        <div>
          <EditorialH1>Auglýsingasafn</EditorialH1>
          <p className="mt-3 text-[15px] text-slate-500">{creatives.length} auglýsingar samtals</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="secondary"
            onClick={() => setShowGenerateModal(true)}
            className="gap-1.5"
          >
            <Sparkles size={15} />
            <span>Á ég enga borða?</span>
          </Button>
          <Button onClick={() => setShowAddModal(true)} className="gap-1.5">
            <Plus size={16} />
            <span>Búa til auglýsingu</span>
          </Button>
        </div>
      </header>

      {/* ===== SEARCH + FILTER ===== */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="min-w-[220px] max-w-[320px] flex-1">
          <Input
            placeholder="Leita að auglýsingu..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <div className="flex flex-wrap gap-2">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setFilter(tab.key)}
              className={`cursor-pointer rounded-full px-[18px] py-[9px] text-sm font-semibold transition-colors ${
                filter === tab.key ? 'bg-primary text-white' : 'text-slate-600'
              }`}
            >
              {tab.label} ({tab.count})
            </button>
          ))}
        </div>
      </div>

      {/* ===== EMPTY / GRID ===== */}
      {visible.length === 0 ? (
        <EmptyState
          icon={<ImageIcon size={44} />}
          title="Engar auglýsingar fundust"
          description="Prófaðu aðra leit eða veldu annan flokk."
        />
      ) : (
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
          {visible.map((c) => {
            let statusText: string = c.reviewStatus;
            let statusVariant: 'success' | 'pending' | 'danger' | 'info' | 'neutral' = 'neutral';

            if (c.reviewStatus === 'auto_approved' || c.reviewStatus === 'manual_approved') {
              statusText = 'Samþykkt';
              statusVariant = 'success';
            } else if (c.reviewStatus === 'pending') {
              statusText = 'Í yfirferð';
              statusVariant = 'pending';
            } else if (c.reviewStatus === 'rejected') {
              statusText = 'Hafnað';
              statusVariant = 'danger';
            }

            const cs = bulkStats?.[c.id];
            const ctrLabel = cs ? `${cs.ctr.toFixed(1).replace('.', ',')}%` : '—';

            return (
              <Card key={c.id} className="flex flex-col overflow-hidden">
                {/* Image — the template shows a generic placeholder box here;
                    we already fetch the real creative image (c.imageUrl), so
                    it's rendered instead of the mock icon, inside the same
                    16:9 rounded frame the template specifies. */}
                <div className="group relative flex aspect-video items-center justify-center overflow-hidden rounded-[10px] bg-slate-100">
                  <img
                    src={c.imageUrl}
                    alt="Auglýsingamynd"
                    className="h-full w-full object-contain"
                  />
                  <div className="absolute inset-0 flex items-center justify-center bg-slate-900/60 opacity-0 transition-opacity group-hover:opacity-100">
                    <a
                      href={c.clickUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="rounded-full bg-white p-2 text-slate-800 transition hover:text-primary"
                    >
                      <ExternalLink size={16} />
                    </a>
                  </div>
                </div>

                {/* Title / body — the template's headline+body slots have no
                    real counterpart on Creative (no ad copy is fetched), so
                    the title falls back to an id-based label (same pattern as
                    CampaignList's unnamed-item fallback) and the body slot
                    honestly shows the OCR text hint we do have, or discloses
                    that none was recorded. */}
                <div className="mt-4 truncate text-base font-bold text-slate-900">
                  Auglýsing {c.id.substring(0, 8)}
                </div>
                <p
                  className="mt-2 text-sm leading-normal text-slate-500"
                  style={{
                    display: '-webkit-box',
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: 'vertical',
                    overflow: 'hidden',
                  }}
                >
                  {c.ocrTextHint || 'Engin textalýsing skráð.'}
                </p>

                {/* Meta — dimensions + click URL substitute for the template's
                    category · campaignName line, neither of which Creative
                    has. */}
                <div className="mt-3.5 truncate text-[13px] text-slate-400">
                  {c.width} × {c.height} px · {c.clickUrl}
                </div>

                {cs && (
                  <div className="mt-2 text-[13px] text-slate-400 tabular-nums">
                    {cs.impressions.toLocaleString('is-IS')} birtingar ·{' '}
                    {cs.clicks.toLocaleString('is-IS')} smellir
                  </div>
                )}

                {c.reviewStatus === 'rejected' && c.reviewLog && c.reviewLog[0] && (
                  <p className="mt-2 rounded bg-red-50 p-1.5 text-[11px] font-bold text-red-600">
                    Ástæða: {c.reviewLog[0].reason}
                  </p>
                )}

                {/* ===== FOOTER ===== status + CTR, copied verbatim in shape
                    from the template's card footer. */}
                <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-4">
                  <Badge variant={statusVariant}>{statusText}</Badge>
                  {/* Cross-campaign by design — this is the library, not a
                      campaign page — but the window was invisible and the
                      figure read as lifetime. */}
                  <span className="text-[13px] text-slate-500 tabular-nums">
                    CTR {ctrLabel}
                    {cs ? <span className="text-slate-400"> (7 daga)</span> : null}
                  </span>
                </div>

                {/* Edit/delete actions — not pictured in the template (a
                    read-only mock), kept because handleStartEdit and
                    setDeleteConfirmCreative must stay reachable. */}
                <div className="mt-3 flex justify-end gap-2 border-t border-slate-100 pt-3">
                  <Button
                    variant="ghost"
                    className="h-auto gap-1.5 px-3 py-1.5 text-xs font-bold text-slate-600 hover:text-slate-900"
                    onClick={() => handleStartEdit(c)}
                  >
                    <Edit2 size={13} />
                    <span>Breyta</span>
                  </Button>
                  <Button
                    variant="ghost"
                    className="h-auto gap-1.5 px-3 py-1.5 text-xs font-bold text-red-600 hover:bg-red-50 hover:text-red-700"
                    onClick={() => setDeleteConfirmCreative(c)}
                  >
                    <Trash2 size={13} />
                    <span>Eyða</span>
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Generate Creative Modal (AI) */}
      {showGenerateModal && (
        <GenerateCreativeModal
          onClose={() => setShowGenerateModal(false)}
          onComplete={() => {
            qc.invalidateQueries({ queryKey: ['creatives'] });
            setShowGenerateModal(false);
          }}
        />
      )}

      {/* Add Creative Modal */}
      {showAddModal && (
        <AddCreativeModal
          clickUrl={clickUrl}
          setClickUrl={setClickUrl}
          imageUrl={imageUrl}
          imageWidth={imageWidth}
          imageHeight={imageHeight}
          ocrTextHint={ocrTextHint}
          setOcrTextHint={setOcrTextHint}
          error={error}
          uploading={uploading}
          onFileChange={handleFileChange}
          onSubmit={handleUploadSubmit}
          onClose={() => setShowAddModal(false)}
        />
      )}

      {/* Edit Creative Modal */}
      {showEditModal && editingCreative && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm">
          <Card className="w-full max-w-md space-y-4 overflow-hidden bg-white p-6 shadow-2xl">
            <h3 className="border-b border-slate-100 pb-3 text-lg font-bold text-slate-900">
              Breyta auglýsingaefni
            </h3>

            <form onSubmit={handleEditSubmit} className="space-y-4">
              <div className="flex items-center gap-3 rounded-md border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
                <img
                  src={editingCreative.imageUrl}
                  alt="creative-preview"
                  className="h-10 w-10 rounded border bg-white object-cover"
                />
                <div>
                  <p className="font-bold text-slate-900">Auglýsing: {editingCreative.id}</p>
                  <p>
                    Stærð: {editingCreative.width} × {editingCreative.height} px
                  </p>
                </div>
              </div>

              <Input
                label="Slóð smella (Click URL) *"
                type="url"
                placeholder="https://fyrirtæki.is/tilbod"
                value={editClickUrl}
                onChange={(e) => setEditClickUrl(e.target.value)}
                required
              />

              <Input
                label="Textahjálp (OCR lýsing) - Valfrjálst"
                placeholder="Dæmi: 20% AFSLÁTTUR AF ÖLLUM VÖRUM Í JÚNÍ!"
                value={editOcrTextHint}
                onChange={(e) => setEditOcrTextHint(e.target.value)}
              />

              {editError && (
                <div className="flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 p-3 text-xs font-semibold text-red-600">
                  <AlertCircle size={14} className="shrink-0" />
                  <span>{editError}</span>
                </div>
              )}

              <div className="flex justify-end gap-3 border-t border-slate-100 pt-4">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => {
                    setShowEditModal(false);
                    setEditingCreative(null);
                  }}
                  disabled={editing}
                >
                  Hætta við
                </Button>
                <Button
                  type="submit"
                  loading={editing}
                  disabled={!editClickUrl.startsWith('https://')}
                >
                  Vista & skanna
                </Button>
              </div>
            </form>
          </Card>
        </div>
      )}

      {/* Delete Confirm Modal */}
      {deleteConfirmCreative && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm">
          <Card className="w-full max-w-md space-y-4 overflow-hidden bg-white p-6 shadow-2xl">
            <h3 className="border-b border-red-100 pb-3 text-lg font-bold text-red-600">
              Eyða auglýsingu
            </h3>

            <div className="space-y-3">
              <p className="text-sm font-medium text-slate-600">
                Ertu viss um að þú viljir eyða auglýsingunni{' '}
                <strong>{deleteConfirmCreative.id}</strong>? Ekki er hægt að afturkalla þessa
                aðgerð.
              </p>
              <p className="rounded border border-amber-200 bg-amber-50 p-3 text-xs font-semibold text-amber-800">
                Athugaðu: Aðeins er hægt að eyða auglýsingum sem eru ekki í notkun í virkum
                herferðum eða herferðum í yfirferð/pásu.
              </p>
            </div>

            {deleteError && (
              <div className="flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 p-3 text-xs font-semibold text-red-600">
                <AlertCircle size={14} className="shrink-0" />
                <span>{deleteError}</span>
              </div>
            )}

            <div className="flex justify-end gap-3 border-t border-slate-100 pt-4">
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  setDeleteConfirmCreative(null);
                  setDeleteError(null);
                }}
                disabled={deleting}
              >
                Hætta við
              </Button>
              <Button
                type="button"
                variant="danger"
                onClick={handleDeleteSubmit}
                loading={deleting}
              >
                Já, eyða auglýsingu
              </Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}

// Add Creative modal — factored out only so it can render from both the
// true-empty-state early return and the normal grid view without duplicating
// markup; behaviour/props are the same handlers/state from the parent.
function AddCreativeModal({
  clickUrl,
  setClickUrl,
  imageUrl,
  imageWidth,
  imageHeight,
  ocrTextHint,
  setOcrTextHint,
  error,
  uploading,
  onFileChange,
  onSubmit,
  onClose,
}: {
  clickUrl: string;
  setClickUrl: (v: string) => void;
  imageUrl: string;
  imageWidth: number;
  imageHeight: number;
  ocrTextHint: string;
  setOcrTextHint: (v: string) => void;
  error: string | null;
  uploading: boolean;
  onFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onSubmit: (e: React.FormEvent) => void;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm">
      <Card className="w-full max-w-md space-y-4 overflow-hidden bg-white p-6 shadow-2xl">
        <h3 className="border-b border-slate-100 pb-3 text-lg font-bold text-slate-900">
          Hlaða upp auglýsingaefni
        </h3>

        <form onSubmit={onSubmit} className="space-y-4">
          <div className="rounded-lg border-2 border-dashed border-slate-200 p-5 text-center transition hover:bg-slate-50">
            <Upload size={28} className="mx-auto mb-1 text-slate-400" />
            <p className="text-xs font-bold text-slate-700">Veldu skrá í tölvunni</p>
            <input
              type="file"
              accept="image/png,image/jpeg,image/jpg"
              className="hidden"
              id="modal-file-upload"
              onChange={onFileChange}
            />
            <Button
              type="button"
              variant="secondary"
              className="mt-2.5 px-3 py-1.5 text-[10px]"
              onClick={() => document.getElementById('modal-file-upload')?.click()}
            >
              Velja mynd
            </Button>
          </div>

          {imageUrl && (
            <div className="flex items-center gap-3 rounded-md border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
              <img
                src={imageUrl}
                alt="preview"
                className="h-10 w-10 rounded border bg-white object-cover"
              />
              <div>
                <p className="font-bold text-slate-900">Uppgötvuð stærð:</p>
                <p>
                  {imageWidth} × {imageHeight} dílar
                </p>
              </div>
            </div>
          )}

          <Input
            label="Slóð smella (Click URL) *"
            type="url"
            placeholder="https://fyrirtæki.is/tilbod"
            value={clickUrl}
            onChange={(e) => setClickUrl(e.target.value)}
            required
          />

          <Input
            label="Textahjálp (OCR lýsing) - Valfrjálst"
            placeholder="Dæmi: 20% AFSLÁTTUR AF ÖLLUM VÖRUM Í JÚNÍ!"
            value={ocrTextHint}
            onChange={(e) => setOcrTextHint(e.target.value)}
          />

          {error && (
            <div className="flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 p-3 text-xs font-semibold text-red-600">
              <AlertCircle size={14} className="shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div className="flex justify-end gap-3 border-t border-slate-100 pt-4">
            <Button type="button" variant="ghost" onClick={onClose} disabled={uploading}>
              Hætta við
            </Button>
            <Button
              type="submit"
              loading={uploading}
              disabled={!clickUrl.startsWith('https://') || !imageUrl}
            >
              Hlaða upp & skanna
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}

// AI-generation modal — thin wrapper around the shared CreativeGenerator
// component (also used by CampaignCreate's step-2 branch). Every size it
// creates lands directly in the library via the normal createCreative path,
// so onComplete here only needs to refresh the list and close the modal.
function GenerateCreativeModal({
  onClose,
  onComplete,
}: {
  onClose: () => void;
  onComplete: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm">
      <Card className="w-full max-w-lg space-y-4 overflow-y-auto bg-white p-6 shadow-2xl max-h-[90vh]">
        <h3 className="border-b border-slate-100 pb-3 text-lg font-bold text-slate-900">
          Búa til auglýsingu með gervigreind
        </h3>
        <CreativeGenerator onComplete={onComplete} onCancel={onClose} />
      </Card>
    </div>
  );
}
