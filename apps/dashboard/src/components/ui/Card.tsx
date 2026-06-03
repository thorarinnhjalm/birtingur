import type { HTMLAttributes } from 'react';
import clsx from 'clsx';

export function Card({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={clsx(
        'bg-white border border-slate-200 rounded-card p-6 shadow-[0_1px_2px_rgba(0,0,0,0.05)] transition-all duration-200 hover:shadow-[0_4px_12px_rgba(0,0,0,0.08)]',
        className,
      )}
      {...rest}
    />
  );
}
