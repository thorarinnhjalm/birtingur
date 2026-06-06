import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Input } from '@/components/ui/Input';
import { LoadingState } from '@/components/ui/LoadingState';
import { EmptyState } from '@/components/ui/EmptyState';
import { AlertCircle, Image as ImageIcon, Plus, ExternalLink, Upload } from 'lucide-react';
import type { Creative } from '@ada/shared';
import { useBulkCreativeStats } from '@/hooks/useCampaigns';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { storage } from '@/lib/firebase';
import { useAdvertiser } from '@/hooks/useAdvertiser';

export default function CreativeLibrary() {
  const qc = useQueryClient();
  const [showAddModal, setShowAddModal] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { data: bulkStats } = useBulkCreativeStats();
  const { data: advertiser } = useAdvertiser();

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

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Mínar auglýsingar</h1>
          <p className="text-slate-500 text-sm font-medium mt-1">
            Stjórnaðu og hlaðið upp auglýsingaborðum í Birtingur-vettvanginn.
          </p>
        </div>
        <Button onClick={() => setShowAddModal(true)} className="font-bold text-sm py-2.5 gap-1.5">
          <Plus size={16} />
          <span>Hlaða upp auglýsingu</span>
        </Button>
      </div>

      {!creatives || creatives.length === 0 ? (
        <EmptyState
          icon={<ImageIcon size={44} />}
          title="Engar auglýsingar í safninu"
          description="Hlaða upp fyrsta auglýsingaborðinu þínu til að geta valið það inn í herferðir."
          action={<Button onClick={() => setShowAddModal(true)}>Hlaða upp nýrri auglýsingu</Button>}
        />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
          {creatives.map((c) => {
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

            return (
              <Card
                key={c.id}
                className="flex flex-col justify-between overflow-hidden p-4 space-y-3"
              >
                <div className="border border-slate-200 rounded-md overflow-hidden bg-slate-50 h-40 flex items-center justify-center relative group">
                  <img src={c.imageUrl} alt="Creative" className="object-contain w-full h-full" />
                  <div className="absolute inset-0 bg-slate-900/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                    <a
                      href={c.clickUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-2 bg-white rounded-full text-slate-800 hover:text-primary transition"
                    >
                      <ExternalLink size={16} />
                    </a>
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-xs font-bold text-slate-400 uppercase">{c.id}</span>
                    <Badge variant={statusVariant}>{statusText}</Badge>
                  </div>
                  <div className="text-xs text-slate-600 font-semibold space-y-1">
                    <p>
                      Víddir: {c.width} × {c.height} px
                    </p>
                    <p className="truncate">Smellur: {c.clickUrl}</p>
                    {(() => {
                      const cs = bulkStats?.[c.id];
                      return cs ? (
                        <div className="flex items-center gap-2 text-[10px] font-bold text-slate-500 bg-slate-50 border border-slate-200 rounded px-2 py-1 mt-1">
                          <span>
                            Birtingar:{' '}
                            <span className="text-slate-800">
                              {cs.impressions.toLocaleString('is-IS')}
                            </span>
                          </span>
                          <span className="text-slate-300">·</span>
                          <span>
                            Smellir:{' '}
                            <span className="text-slate-800">
                              {cs.clicks.toLocaleString('is-IS')}
                            </span>
                          </span>
                          <span className="text-slate-300">·</span>
                          <span>
                            CTR:{' '}
                            <span className="text-slate-800">
                              {cs.ctr.toFixed(1).replace('.', ',')}%
                            </span>
                          </span>
                        </div>
                      ) : (
                        <div className="text-[10px] text-slate-400 italic mt-1">Engin tölfræði</div>
                      );
                    })()}
                    {c.reviewStatus === 'rejected' && c.reviewLog && c.reviewLog[0] && (
                      <p className="text-red-600 font-bold mt-1 text-[10px] bg-red-50 p-1.5 rounded">
                        Ástæða: {c.reviewLog[0].reason}
                      </p>
                    )}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Add Creative Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <Card className="max-w-md w-full bg-white shadow-2xl overflow-hidden p-6 space-y-4">
            <h3 className="text-lg font-bold text-slate-900 border-b border-slate-100 pb-3">
              Hlaða upp auglýsingaefni
            </h3>

            <form onSubmit={handleUploadSubmit} className="space-y-4">
              <div className="border-2 border-dashed border-slate-200 rounded-lg p-5 text-center hover:bg-slate-50 transition">
                <Upload size={28} className="mx-auto text-slate-400 mb-1" />
                <p className="text-xs font-bold text-slate-700">Veldu skrá í tölvunni</p>
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/jpg"
                  className="hidden"
                  id="modal-file-upload"
                  onChange={handleFileChange}
                />
                <Button
                  type="button"
                  variant="secondary"
                  className="mt-2.5 text-[10px] py-1.5 px-3"
                  onClick={() => document.getElementById('modal-file-upload')?.click()}
                >
                  Velja mynd
                </Button>
              </div>

              {imageUrl && (
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-md text-xs text-slate-600 flex items-center gap-3">
                  <img
                    src={imageUrl}
                    alt="preview"
                    className="w-10 h-10 object-cover bg-white rounded border"
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
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs font-semibold text-red-600 flex items-center gap-1.5">
                  <AlertCircle size={14} className="shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              <div className="flex gap-3 justify-end pt-4 border-t border-slate-100">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setShowAddModal(false)}
                  disabled={uploading}
                >
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
      )}
    </div>
  );
}
