import { type ButtonHTMLAttributes, forwardRef } from 'react';
import clsx from 'clsx';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  loading?: boolean;
}

const styles: Record<Variant, string> = {
  primary:
    'bg-primary text-white hover:bg-primary-800 active:bg-primary-700 disabled:bg-slate-300 shadow-[0_1px_2px_rgba(0,0,0,0.05)] hover:shadow-md cursor-pointer',
  secondary: 'bg-white border border-primary text-primary hover:bg-slate-50 cursor-pointer',
  ghost: 'text-slate-600 hover:bg-slate-100 cursor-pointer',
  danger: 'bg-red-600 text-white hover:bg-red-700 cursor-pointer',
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'primary', loading, className, children, disabled, ...rest }, ref) => (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={clsx(
        'inline-flex items-center justify-center px-5 py-3 rounded-lg font-semibold transition-all duration-200 active:scale-98 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 disabled:scale-100 disabled:pointer-events-none text-sm',
        styles[variant],
        className,
      )}
      {...rest}
    >
      {loading ? (
        <span className="inline-flex items-center gap-2">
          <svg
            className="animate-spin -ml-1 mr-2 h-4 w-4 text-current"
            fill="none"
            viewBox="0 0 24 24"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            />
          </svg>
          Hleður...
        </span>
      ) : (
        children
      )}
    </button>
  ),
);

Button.displayName = 'Button';
