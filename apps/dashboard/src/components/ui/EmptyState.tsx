import type { ReactNode } from 'react';

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="text-center py-16 px-4 bg-white border border-dashed border-slate-200 rounded-card shadow-[0_1px_2px_rgba(0,0,0,0.02)]">
      {icon && <div className="mx-auto mb-4 text-slate-400 flex justify-center">{icon}</div>}
      <h3 className="text-lg font-semibold text-slate-900">{title}</h3>
      {description && <p className="mt-2 text-sm text-slate-500 max-w-md mx-auto">{description}</p>}
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}
