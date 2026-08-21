import { useEffect, useState } from 'react';

// Tailwind's md breakpoint, as a hook rather than CSS visibility classes:
// rendering BOTH a table and its card-row twin and hiding one with `hidden
// md:block` would duplicate every row in the DOM, and getByText-style queries
// (tests and a11y tools alike) would match twice. jsdom has no matchMedia, so
// the guard defaults to desktop there — tests exercise the table markup, real
// phones get the cards.
const QUERY = '(max-width: 767px)';

export function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState<boolean>(() =>
    typeof window.matchMedia === 'function' ? window.matchMedia(QUERY).matches : false,
  );

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const mql = window.matchMedia(QUERY);
    // Typed via the mql instance rather than the MediaQueryListEvent global —
    // eslint's browser-globals list predates it.
    const onChange = (e: { matches: boolean }) => setIsMobile(e.matches);
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, []);

  return isMobile;
}
