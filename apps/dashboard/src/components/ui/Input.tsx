import { type InputHTMLAttributes, forwardRef } from 'react';
import clsx from 'clsx';

interface Props extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

export const Input = forwardRef<HTMLInputElement, Props>(
  ({ label, error, className, ...rest }, ref) => (
    <label className="block w-full">
      {label && <span className="block text-sm font-medium text-slate-700 mb-1">{label}</span>}
      <input
        ref={ref}
        className={clsx(
          'w-full px-4 py-3 border rounded-lg text-slate-900 bg-white transition-all focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary disabled:bg-slate-50 disabled:text-slate-500 text-sm shadow-[0_1px_2px_rgba(0,0,0,0.02)]',
          error ? 'border-red-500 focus:ring-red-200' : 'border-slate-300',
          className,
        )}
        {...rest}
      />
      {error && <span className="block mt-1 text-xs text-red-600 font-medium">{error}</span>}
    </label>
  ),
);

Input.displayName = 'Input';
