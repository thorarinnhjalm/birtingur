import clsx from 'clsx';
import type { ReactNode } from 'react';

type Variant = 'success' | 'pending' | 'danger' | 'info' | 'neutral';

const styles: Record<Variant, string> = {
  success: 'bg-green-50 text-green-700 border-green-200/60',
  pending: 'bg-yellow-50 text-yellow-700 border-yellow-200/60',
  danger: 'bg-red-50 text-red-700 border-red-200/60',
  info: 'bg-blue-50 text-blue-700 border-blue-200/60',
  neutral: 'bg-slate-50 text-slate-700 border-slate-200/60',
};

export function Badge({ variant, children }: { variant: Variant; children: ReactNode }) {
  return (
    <span
      className={clsx(
        'inline-flex items-center px-2.5 py-0.5 text-xs font-semibold rounded-md border',
        styles[variant]
      )}
    >
      {children}
    </span>
  );
}
