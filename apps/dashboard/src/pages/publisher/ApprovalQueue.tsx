import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { LoadingState } from '@/components/ui/LoadingState';
import { EmptyState } from '@/components/ui/EmptyState';
import { Input } from '@/components/ui/Input';
import { CheckCircle, Check, X, AlertCircle } from 'lucide-react';
import { useState } from 'react';
import type { Campaign, Creative } from '@ada/shared';

interface QueueItem {
  creative: Creative;
  campaign: Campaign;
}

export default function ApprovalQueue() {
  const qc = useQueryClient();
  const [rejectId, setRejectId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [actionError, setActionError] = useState<string | null>(null);

  // Fetch pending queue items
  const { data, isLoading, refetch } = useQuery<{ items: QueueItem[] }>({
    queryKey: ['publisher', 'pending-approvals'],
    queryFn: () => apiFetch<{ items: QueueItem[] }>('/v1/publishers/me/pending-approvals'),
  });

  // Approve/Reject Mutation
  const reviewMutation = useMutation({
    mutationFn: ({
      campaignId,
      action,
      reason,
    }: {
      campaignId: string;
      action: 'approve' | 'reject';
      reason?: string;
    }) =>
      apiFetch(`/v1/publishers/me/approvals/${campaignId}`, {
        method: 'POST',
        body: JSON.stringify({ action, reason }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['publisher', 'pending-approvals'] });
      setRejectId(null);
      setRejectReason('');
    },
  });

  const handleApprove = async (campaignId: string) => {
    setActionError(null);
    try {
      await reviewMutation.mutateAsync({ campaignId, action: 'approve' });
    } catch (err: any) {
      setActionError(err.message || 'Ekki tókst að samþykkja herferð.');
    }
  };

  const handleRejectSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rejectId) return;
    setActionError(null);

    if (!rejectReason.trim()) {
      setActionError('Skrifa verður ástæðu fyrir höfnun');
      return;
    }

    try {
      await reviewMutation.mutateAsync({
        campaignId: rejectId,
        action: 'reject',
        reason: rejectReason,
      });
    } catch (err: any) {
      setActionError(err.message || 'Ekki tókst að hafna herferð.');
    }
  };

  if (isLoading) return <LoadingState />;

  const queueItems = data?.items || [];

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Umsóknir í bið (Approvals)</h1>
        <p className="text-slate-500 text-sm font-medium mt-1">
          Yfirfarðu auglýsingar sem óskað hefur verið eftir að birta á þínum vef.
        </p>
      </div>

      {actionError && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs font-semibold text-red-600 flex items-center gap-1.5">
          <AlertCircle size={14} className="shrink-0" />
          <span>{actionError}</span>
        </div>
      )}

      {queueItems.length === 0 ? (
        <EmptyState
          icon={<CheckCircle size={44} className="text-green-500" />}
          title="Allt afgreitt!"
          description="Engar umsóknir bíða yfirferðar hjá þér að svo stöddu."
        />
      ) : (
        <div className="space-y-4">
          {queueItems.map(({ creative, campaign }) => (
            <Card key={campaign.id} className="p-6 flex flex-col md:flex-row gap-6 justify-between">
              {/* Creative Image column */}
              <div className="w-full md:w-48 shrink-0 bg-slate-50 border border-slate-200 rounded overflow-hidden h-32 flex items-center justify-center">
                <img
                  src={creative.imageUrl}
                  alt="Ad Preview"
                  className="object-contain w-full h-full"
                />
              </div>

              {/* Campaign details column */}
              <div className="flex-1 min-w-0 space-y-3">
                <div>
                  <h3 className="font-bold text-slate-900 text-base">Herferð {campaign.id}</h3>
                </div>

                <div className="text-xs font-semibold text-slate-500 space-y-1">
                  <p>
                    Smellt fer á:{' '}
                    <a
                      href={creative.clickUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary hover:underline font-bold inline-flex items-center gap-0.5"
                    >
                      {creative.clickUrl}
                    </a>
                  </p>
                  <p>
                    Stærð auglýsingar: {creative.width} × {creative.height} px
                  </p>
                  <p>
                    Áætlaður upphafstími:{' '}
                    {new Date(campaign.schedule.startsAt).toLocaleDateString('is-IS')}
                  </p>
                </div>
              </div>

              {/* Approve / Reject Actions column */}
              <div className="w-full md:w-44 shrink-0 flex md:flex-col justify-end gap-2">
                <Button
                  onClick={() => handleApprove(campaign.id)}
                  loading={reviewMutation.isPending && rejectId !== campaign.id}
                  className="font-bold text-xs py-2.5 bg-green-600 hover:bg-green-700 w-full justify-center flex gap-1 border border-transparent"
                >
                  <Check size={14} />
                  <span>Samþykkja</span>
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => setRejectId(campaign.id)}
                  disabled={reviewMutation.isPending}
                  className="font-bold text-xs py-2.5 border-red-200 text-red-600 hover:bg-red-50 hover:border-red-300 w-full justify-center flex gap-1 cursor-pointer"
                >
                  <X size={14} />
                  <span>Hafna</span>
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Reject Overlay Dialog */}
      {rejectId && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <Card className="max-w-md w-full bg-white p-6 space-y-4">
            <h3 className="text-lg font-bold text-slate-900 border-b border-slate-100 pb-3">
              Hafna herferð
            </h3>

            <form onSubmit={handleRejectSubmit} className="space-y-4">
              <Input
                label="Ástæða höfnunar *"
                placeholder="Skrifaðu stutta skýringu svo auglýsandi geti lagfært (t.d. stærð passar ekki, óviðeigandi efni)..."
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                required
              />

              <div className="flex gap-3 justify-end pt-4 border-t border-slate-100">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => {
                    setRejectId(null);
                    setRejectReason('');
                  }}
                  disabled={reviewMutation.isPending}
                >
                  Hætta við
                </Button>
                <Button
                  type="submit"
                  variant="danger"
                  loading={reviewMutation.isPending}
                  disabled={!rejectReason.trim()}
                >
                  Hafna birtingu
                </Button>
              </div>
            </form>
          </Card>
        </div>
      )}
    </div>
  );
}
