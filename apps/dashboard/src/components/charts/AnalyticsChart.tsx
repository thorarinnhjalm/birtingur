import { useState } from 'react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from 'recharts';

interface ChartDataPoint {
  date: string;
  impressions: number;
  clicks: number;
  spendIsk?: number;
  pageviews?: number;
}

interface AnalyticsChartProps {
  data: ChartDataPoint[];
  mode: 'publisher' | 'advertiser';
}

type MetricKey = 'impressions' | 'clicks' | 'ctr' | 'money' | 'pageviews';

export function AnalyticsChart({ data, mode }: AnalyticsChartProps) {
  const [selectedMetric, setSelectedMetric] = useState<MetricKey>('impressions');

  if (!data || data.length === 0) {
    return (
      <div className="h-64 flex items-center justify-center text-slate-400 bg-slate-50 border border-slate-200 border-dashed rounded-lg text-sm font-semibold">
        Engin tölfræðigögn fundust á þessu tímabili
      </div>
    );
  }

  // Format and project dataset
  const formattedData = data.map((d) => {
    let label = d.date;
    try {
      const parsed = new Date(d.date);
      if (!isNaN(parsed.getTime())) {
        label = parsed.toLocaleDateString('is-IS', { day: '2-digit', month: 'short' });
      }
    } catch {
      // ignore
    }

    const impressions = d.impressions || 0;
    const clicks = d.clicks || 0;

    // CTR capped at 100%
    const ctr = impressions > 0 ? Math.min(100, (clicks / impressions) * 100) : 0;

    // Publisher gets 80% (platform fee is 20%), Advertiser pays 100%
    const money = mode === 'publisher' ? Math.round((d.spendIsk || 0) * 0.8) : d.spendIsk || 0;

    return {
      ...d,
      label,
      ctr,
      money,
      pageviews: d.pageviews || 0,
    };
  });

  const getMetricDetails = () => {
    switch (selectedMetric) {
      case 'clicks':
        return {
          label: 'Smellir',
          dataKey: 'clicks',
          color: '#10b981', // emerald-500
          formatter: (v: number) => v.toLocaleString('is-IS'),
        };
      case 'ctr':
        return {
          label: 'CTR (Smellihlutfall)',
          dataKey: 'ctr',
          color: '#f59e0b', // amber-500
          formatter: (v: number) => `${v.toFixed(2).replace('.', ',')}%`,
        };
      case 'money':
        return {
          label: mode === 'publisher' ? 'Áætlaðar tekjur' : 'Kostnaður',
          dataKey: 'money',
          color: '#8b5cf6', // purple-500
          formatter: (v: number) => `${v.toLocaleString('is-IS')} kr.`,
        };
      case 'pageviews':
        return {
          label: 'Vefumferð',
          dataKey: 'pageviews',
          color: '#0ea5e9', // sky-500
          formatter: (v: number) => v.toLocaleString('is-IS'),
        };
      default:
        return {
          label: 'Birtingar',
          dataKey: 'impressions',
          color: '#2563eb', // blue-600
          formatter: (v: number) => v.toLocaleString('is-IS'),
        };
    }
  };

  const metric = getMetricDetails();

  return (
    <div className="space-y-4">
      {/* Metric Selector Tabs */}
      <div className="flex flex-wrap gap-2 border-b border-slate-100 pb-3">
        {(
          [
            'impressions',
            'clicks',
            'ctr',
            'money',
            // Only publisher stats carry pageviews (slot traffic incl. no-fill).
            ...(mode === 'publisher' ? (['pageviews'] as const) : []),
          ] satisfies readonly MetricKey[]
        ).map((key) => {
          const tabLabel =
            key === 'impressions'
              ? 'Birtingar'
              : key === 'clicks'
                ? 'Smellir'
                : key === 'ctr'
                  ? 'CTR (Smellihlutfall)'
                  : key === 'pageviews'
                    ? 'Vefumferð'
                    : mode === 'publisher'
                      ? 'Áætlaðar tekjur'
                      : 'Kostnaður';

          const active = selectedMetric === key;
          return (
            <button
              key={key}
              type="button"
              onClick={() => setSelectedMetric(key)}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all border cursor-pointer ${
                active
                  ? 'bg-primary border-primary text-white shadow-[0_2px_4px_rgba(30,58,138,0.15)]'
                  : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50 hover:border-slate-300'
              }`}
            >
              {tabLabel}
            </button>
          );
        })}
      </div>

      <div className="h-80 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={formattedData} margin={{ top: 10, right: 10, left: -10, bottom: 5 }}>
            <defs>
              <linearGradient id="metricGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={metric.color} stopOpacity={0.2} />
                <stop offset="100%" stopColor={metric.color} stopOpacity={0.0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
            <XAxis
              dataKey="label"
              stroke="#94a3b8"
              fontSize={11}
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              stroke="#94a3b8"
              fontSize={11}
              tickLine={false}
              axisLine={false}
              tickFormatter={(v) => {
                if (selectedMetric === 'money')
                  return `${v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v} kr.`;
                if (selectedMetric === 'ctr') return `${v.toFixed(0)}%`;
                return v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v;
              }}
            />
            <Tooltip
              cursor={{ stroke: 'rgba(148, 163, 184, 0.1)', strokeWidth: 1 }}
              content={({ active, payload }) => {
                if (active && payload && payload.length) {
                  const val = payload[0]!.value as number;
                  const item = payload[0]!.payload;
                  let formattedDate = item.date;
                  try {
                    const parsed = new Date(item.date);
                    if (!isNaN(parsed.getTime())) {
                      formattedDate = parsed.toLocaleDateString('is-IS', {
                        day: 'numeric',
                        month: 'long',
                        year: 'numeric',
                      });
                    }
                  } catch {
                    // ignore
                  }

                  return (
                    <div className="bg-slate-950/95 backdrop-blur text-white p-3.5 rounded-xl text-xs font-semibold shadow-xl border border-slate-800 space-y-1.5">
                      <p className="text-slate-400 font-bold border-b border-slate-800 pb-1">
                        {formattedDate}
                      </p>
                      <div className="flex justify-between items-center gap-6">
                        <span className="text-slate-350">{metric.label}:</span>
                        <span className="font-bold text-right" style={{ color: metric.color }}>
                          {metric.formatter(val)}
                        </span>
                      </div>
                    </div>
                  );
                }
                return null;
              }}
            />
            <Area
              type="monotone"
              dataKey={metric.dataKey}
              stroke={metric.color}
              strokeWidth={2}
              fillOpacity={1}
              fill="url(#metricGradient)"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
