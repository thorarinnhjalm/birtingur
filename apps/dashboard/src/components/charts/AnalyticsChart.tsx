import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';

interface ChartDataPoint {
  date: string;
  impressions: number;
  clicks: number;
}

interface AnalyticsChartProps {
  data: ChartDataPoint[];
}

export function AnalyticsChart({ data }: AnalyticsChartProps) {
  if (data.length === 0) {
    return (
      <div className="h-64 flex items-center justify-center text-slate-400 bg-slate-50 border border-slate-200 border-dashed rounded-lg text-sm">
        Engin tölfræðigögn fundust á þessu tímabili
      </div>
    );
  }

  // Format date values to be cleaner (e.g., just day of month or shortened)
  const formattedData = data.map((d) => {
    // If it is YYYY-MM-DD or similar, format nicely
    let label = d.date;
    try {
      const parsed = new Date(d.date);
      if (!isNaN(parsed.getTime())) {
        label = parsed.toLocaleDateString('is-IS', { day: '2-digit', month: 'short' });
      }
    } catch {
      // ignore formatting error
    }
    return {
      ...d,
      label,
    };
  });

  return (
    <div className="h-80 w-full mt-4">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={formattedData} margin={{ top: 10, right: 30, left: 10, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
          <XAxis
            dataKey="label"
            stroke="#94a3b8"
            fontSize={11}
            tickLine={false}
            axisLine={{ stroke: '#e2e8f0' }}
          />
          <YAxis
            yAxisId="left"
            stroke="#94a3b8"
            fontSize={11}
            tickLine={false}
            axisLine={{ stroke: '#e2e8f0' }}
            label={{ value: 'Birtingar', angle: -90, position: 'insideLeft', offset: -5, fill: '#64748b', fontSize: 11 }}
          />
          <YAxis
            yAxisId="right"
            orientation="right"
            stroke="#94a3b8"
            fontSize={11}
            tickLine={false}
            axisLine={{ stroke: '#e2e8f0' }}
            label={{ value: 'Smellir', angle: 90, position: 'insideRight', offset: -5, fill: '#64748b', fontSize: 11 }}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: '#1e293b',
              border: 'none',
              borderRadius: '8px',
              color: '#f8fafc',
              fontSize: '12px',
            }}
            labelStyle={{ fontWeight: 'bold', marginBottom: '4px', color: '#ffffff' }}
          />
          <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '10px' }} />
          <Line
            yAxisId="left"
            type="monotone"
            dataKey="impressions"
            name="Birtingar"
            stroke="#1e3a8a"
            strokeWidth={2.5}
            activeDot={{ r: 6 }}
            dot={{ r: 3, strokeWidth: 1 }}
          />
          <Line
            yAxisId="right"
            type="monotone"
            dataKey="clicks"
            name="Smellir"
            stroke="#0ea5e9"
            strokeWidth={2}
            activeDot={{ r: 5 }}
            dot={{ r: 2, strokeWidth: 1 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
