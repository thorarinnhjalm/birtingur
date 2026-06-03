import { Card } from './Card';
import clsx from 'clsx';

interface Props {
  label: string;
  value: string | number;
  delta?: { value: string; positive: boolean };
}

export function StatCard({ label, value, delta }: Props) {
  return (
    <Card className="flex flex-col justify-between min-h-[120px]">
      <div>
        <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">{label}</div>
        <div className="mt-2 text-3xl font-bold text-slate-900 tracking-tight">{value}</div>
      </div>
      {delta && (
        <div className={clsx('mt-2 text-xs font-semibold inline-flex items-center gap-1', delta.positive ? 'text-green-600' : 'text-red-600')}>
          <span className="text-sm font-bold">{delta.positive ? '↑' : '↓'}</span>
          <span>{delta.value}</span>
        </div>
      )}
    </Card>
  );
}
