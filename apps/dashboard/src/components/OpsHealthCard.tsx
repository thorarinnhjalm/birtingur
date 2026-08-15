import { Card } from '@/components/ui/Card';

/**
 * Cron and queue health, in plain Icelandic.
 *
 * The admin diagnostics page already showed queue depths, which answer "is
 * work piling up". It could not answer "is anything draining it" — a
 * silently dead cron looks exactly like a quiet day until the queue has been
 * growing for hours. That signal (the heartbeat each cron writes on success)
 * existed only in Redis and in an ops alert email.
 */

export interface CronHealth {
  name: string;
  ageMinutes: number | null;
  stalenessThresholdMinutes: number;
  stale: boolean;
}

export interface OpsDiagnosticsData {
  checkedAt: string;
  redis:
    | { status: 'unconfigured' }
    | { status: 'error'; message: string }
    | {
        status: 'ok';
        queues: { stats: number; accrual: number; legacy: number };
        oldestStatsEventAgeSeconds: number | null;
      };
  crons: CronHealth[];
  env: Record<string, boolean>;
  healthy: boolean;
  problems: string[];
}

/** What each cron is responsible for, so the row means something on its own. */
const CRON_LABELS: Record<string, string> = {
  'cron-accrue': 'Bókar tekjur af birtingum',
  'cron-aggregate': 'Tekur saman tölfræði',
  'cron-refresh-cache': 'Endurbyggir birtingarskrána',
  'cron-payouts': 'Býr til útborganir',
  'cron-reconcile': 'Ber saman bókhald og fjárhag',
};

function formatAge(minutes: number | null): string {
  if (minutes === null) return 'Aldrei keyrt';
  if (minutes < 1) return 'Rétt í þessu';
  if (minutes < 60) return `Fyrir ${minutes} mín`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `Fyrir ${hours} klst`;
  return `Fyrir ${Math.floor(hours / 24)} dögum`;
}

function Row({ label, value, tone }: { label: string; value: string; tone?: 'bad' | 'warn' }) {
  return (
    <div className="flex justify-between items-baseline gap-4 py-2 border-b border-slate-100 last:border-0">
      <span className="text-xs font-semibold text-slate-600">{label}</span>
      <span
        className={`text-xs font-bold tabular-nums ${
          tone === 'bad' ? 'text-red-600' : tone === 'warn' ? 'text-amber-600' : 'text-slate-900'
        }`}
      >
        {value}
      </span>
    </div>
  );
}

export function OpsHealthCard({ data }: { data?: OpsDiagnosticsData | null }) {
  if (!data) {
    return (
      <Card className="p-6">
        <h3 className="text-base font-bold text-slate-900 mb-2 flex items-center gap-2">
          <span className="material-symbols-outlined text-primary text-lg">monitor_heart</span>
          Heilsa pípulagnarinnar
        </h3>
        <p className="text-xs text-slate-400 font-medium">Hleð stöðu...</p>
      </Card>
    );
  }

  const requiredMissing = Object.entries(data.env)
    .filter(
      ([key, present]) =>
        !present &&
        // Must stay in step with the required list in the API's
        // ops-diagnostics.ts. SIGNING_SECRET is not here: it belongs to the
        // serving deploy, which has its own environment.
        ['CRON_SECRET', 'REDIS', 'FIREBASE_PRIVATE_KEY'].includes(key),
    )
    .map(([key]) => key);

  return (
    <Card className="p-6 space-y-5">
      <div>
        <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
          <span className="material-symbols-outlined text-primary text-lg">monitor_heart</span>
          Heilsa pípulagnarinnar
        </h3>
        <p className="text-[11px] font-medium text-slate-400 mt-1">
          Athugað {new Date(data.checkedAt).toLocaleString('is-IS')}
        </p>
      </div>

      <div
        className={`rounded-lg p-4 text-xs font-semibold ${
          data.healthy
            ? 'bg-green-50 border border-green-200 text-green-900'
            : 'bg-red-50 border border-red-200 text-red-900'
        }`}
      >
        {data.healthy ? (
          <p className="font-bold">Allt í lagi. Birtingar skila sér inn og cron-verkin tæma þær.</p>
        ) : (
          <>
            <p className="font-bold mb-2">Eitthvað þarfnast athygli:</p>
            <ul className="list-disc pl-5 space-y-1 font-medium leading-relaxed">
              {data.problems.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          </>
        )}
      </div>

      <div>
        <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
          Cron-verk
        </h4>
        <div>
          {data.crons.map((cron) => (
            <div
              key={cron.name}
              className="flex justify-between items-center gap-4 py-2.5 border-b border-slate-100 last:border-0"
            >
              <div className="min-w-0">
                <div className="text-xs font-bold text-slate-800">
                  {CRON_LABELS[cron.name] ?? cron.name}
                </div>
                <div className="text-[10px] font-mono text-slate-400">{cron.name}</div>
              </div>
              <div className="text-right shrink-0">
                <div
                  className={`text-xs font-bold ${
                    cron.stale
                      ? 'text-red-600'
                      : cron.ageMinutes === null
                        ? 'text-slate-400'
                        : 'text-green-600'
                  }`}
                >
                  {formatAge(cron.ageMinutes)}
                </div>
                {cron.stale && (
                  <div className="text-[10px] font-semibold text-red-500">
                    Á að keyra á {cron.stalenessThresholdMinutes} mín fresti
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div>
        <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">Biðraðir</h4>
        {data.redis.status === 'ok' ? (
          <>
            <Row label="Tölfræði í bið (events:stats)" value={String(data.redis.queues.stats)} />
            <Row
              label="Uppsöfnun í bið (events:accrual)"
              value={String(data.redis.queues.accrual)}
              tone={data.redis.queues.accrual > 500 ? 'bad' : undefined}
            />
            <Row
              label="Gamla biðröðin (events:queue)"
              value={String(data.redis.queues.legacy)}
              tone={data.redis.queues.legacy > 0 ? 'warn' : undefined}
            />
            <Row
              label="Elsti atburður í bið"
              value={
                data.redis.oldestStatsEventAgeSeconds === null
                  ? 'Engin bið'
                  : `${Math.round(data.redis.oldestStatsEventAgeSeconds / 60)} mín`
              }
              tone={(data.redis.oldestStatsEventAgeSeconds ?? 0) > 3600 ? 'bad' : undefined}
            />
          </>
        ) : (
          <p className="text-xs font-semibold text-red-600 py-2">
            {data.redis.status === 'unconfigured'
              ? 'Redis er ekki stillt í þessu umhverfi.'
              : `Náði ekki sambandi við Redis: ${data.redis.message}`}
          </p>
        )}
      </div>

      {requiredMissing.length > 0 && (
        <div>
          <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
            Stillingar sem vantar
          </h4>
          <p className="text-xs font-semibold text-red-600 py-2">{requiredMissing.join(', ')}</p>
        </div>
      )}
    </Card>
  );
}
