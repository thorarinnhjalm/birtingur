import clsx from 'clsx';
import type { ReactNode } from 'react';

/**
 * Nordic-editorial primitives shared by the redesigned screens. Metrics are
 * copied verbatim from docs/superpowers/specs/2026-07-03-redesign-templates/buy-flow.dc.html
 * so every screen inherits the same numerals, tracking, and rhythm.
 */

export function Eyebrow({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span
      className={clsx(
        'inline-block text-[13px] font-semibold uppercase tracking-[0.16em] text-primary',
        className,
      )}
    >
      {children}
    </span>
  );
}

export function EditorialH1({ children }: { children: ReactNode }) {
  return (
    <h1
      className="m-0 font-extrabold tracking-[-0.03em] leading-none"
      style={{ fontSize: 'clamp(32px,5vw,48px)' }}
    >
      {children}
    </h1>
  );
}

export function NumberedSection({
  n,
  title,
  lede,
  children,
}: {
  n: string;
  title: string;
  lede?: string;
  children: ReactNode;
}) {
  return (
    <section style={{ marginTop: 'clamp(48px,6vw,72px)' }}>
      <div className="flex items-baseline gap-3.5">
        <span className="text-[28px] font-extrabold leading-none tracking-[-0.02em] text-primary tabular-nums">
          {n}
        </span>
        <h2 className="m-0 text-2xl font-extrabold tracking-[-0.02em]">{title}</h2>
      </div>
      {lede && (
        <p className="mt-3 mb-6.5 max-w-[52ch] text-[15px] leading-normal text-slate-500">{lede}</p>
      )}
      {children}
    </section>
  );
}

export function BigFigure({ value, suffix }: { value: string; suffix?: string }) {
  return (
    <div className="flex flex-col">
      <div
        className="font-extrabold leading-none text-slate-900 tabular-nums tracking-[-0.035em] flex items-baseline flex-wrap gap-2"
        style={{ fontSize: 'clamp(36px,5vw,56px)' }}
      >
        <span>{value}</span>
        {suffix && (
          <span
            className="font-semibold text-slate-500"
            style={{ fontSize: '0.4em', letterSpacing: 0, lineHeight: 1.2 }}
          >
            {suffix}
          </span>
        )}
      </div>
    </div>
  );
}

export function PillButton({
  active,
  children,
  onClick,
}: {
  active?: boolean;
  children: ReactNode;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={clsx(
        'cursor-pointer rounded-full border px-4.5 py-2.25 text-[14px] font-semibold tabular-nums transition-colors',
        active
          ? 'border-primary bg-primary/6 text-primary'
          : 'border-slate-200 bg-white text-slate-700',
      )}
    >
      {children}
    </button>
  );
}

export function StepIndicator({ steps, current }: { steps: string[]; current: number }) {
  return (
    <div className="mt-8 flex flex-wrap items-center gap-4.5">
      {steps.map((step, i) => (
        <div className="contents" key={i}>
          {i > 0 && <div className="h-px w-6.5 bg-outline-variant" />}
          <div className="flex items-baseline gap-2.25">
            <span
              className={clsx(
                'text-[13px] font-extrabold tabular-nums',
                i <= current ? 'text-primary' : 'text-slate-400',
              )}
            >
              {String(i + 1).padStart(2, '0')}
            </span>
            <span
              className={clsx(
                'text-sm font-semibold',
                i <= current ? 'text-slate-900' : 'text-slate-400',
              )}
            >
              {step}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}
