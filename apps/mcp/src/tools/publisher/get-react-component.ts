import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { apiCall } from '../../lib/api-client.js';

const Input = z.object({
  slotId: z.string().describe('ID auglýsingaplássins sem á að baka inn í tilbúna notkunardæmið'),
  width: z.number().optional().describe('Breidd í px. Sjálfgefið: fyrsta studda stærð plássins'),
  height: z.number().optional().describe('Hæð í px. Sjálfgefið: fyrsta studda stærð plássins'),
});

const COMPONENT_CODE = `'use client';

import { useEffect, useRef, useState } from 'react';

const SERVING_BASE = 'https://serving.birtingur.app';
// Creatives that should render as transparent (hidden) — house ads are NOT in this set
// because they should display their CTA ("Auglýstu hér á 550 kr. CPM").
const HIDDEN_FALLBACKS = new Set(['cre_fallback_transparent', 'cre_nocache']);

// One page view per page load, regardless of how many <BirtingurAdSlot> instances
// mount on the page — one component per ad slot would otherwise multiply a
// publisher's reported traffic by their slots-per-page ratio (mirrors the rule
// the embed snippet in packages/snippet follows). The flag lives on the global
// object rather than module scope: a page can bundle more than one copy of this
// component (e.g. two independently built routes/chunks each importing their own
// copy), and only a global flag survives that and still reports a single page view.
const PAGEVIEW_FIRED_KEY = '__birtingurPageviewFired';

function firePageviewOnce(pixelUrl: string): void {
  const w = window as unknown as Record<string, boolean | undefined>;
  if (w[PAGEVIEW_FIRED_KEY]) return;
  w[PAGEVIEW_FIRED_KEY] = true;
  const targetUrl = pixelUrl.startsWith('http') ? pixelUrl : \`\${SERVING_BASE}\${pixelUrl}\`;
  const img = new Image();
  img.src = targetUrl;
}

interface BirtingurAd {
  creativeId: string;
  imageUrl: string;
  clickUrl: string;
  width: number;
  height: number;
  impressionPixel: string;
  // Signed page-level pixel — one per real page load, distinct from
  // impressionPixel (one per ad slot). Present on every non-empty /v1/ad
  // response; fired once per page regardless of how many BirtingurAdSlot
  // instances mount (see firePageviewOnce below).
  pageviewPixel?: string;
  ttl: number;
}

interface BirtingurEmpty {
  empty: true;
  impressionPixel?: string;
}

type BirtingurResponse = BirtingurAd | BirtingurEmpty;

function isAd(r: BirtingurResponse | null): r is BirtingurAd {
  return !!r && !('empty' in r);
}

interface Props {
  slotId: string;
  width?: number;
  height?: number;
  sizes?: {
    mobile?: { w: number; h: number };
    tablet?: { w: number; h: number };
    desktop?: { w: number; h: number };
  };
  onLoadStatus?: (status: 'loading' | 'loaded' | 'empty' | 'error') => void;
  className?: string;
}

/**
 * LEIÐBEININGAR UM VILLUMEÐHÖNDLUN (ERROR HANDLING GUIDELINES):
 * 1. Component-inn reynir að lesa JSON villuskilaboð á borð við { error: "skilaboð", code: "..." } ef vefþjónn skilar ekki 200 OK.
 * 2. Ef villa kemur upp er hún skráð í console logga (warning/error) til að auðvelda greiningu í þróun.
 * 3. Í framleiðsluumhverfi (production) fellur component-inn plássið saman sjálfkrafa (renderar gagnsætt fallback)
 *    til að tryggja að notendaupplifun skemmist ekki og engin ljót villuboð sjáist á síðunni.
 * 4. Frá v1.2: Jafnvel þegar slot er ekki í cache skilar serving tracking pixel sem skráir slot-hleðslu,
 *    þannig að tölfræði útgefandans sýnir rétta umferð.
 * 5. Frá v1.3: Component-inn fýrir pageviewPixel úr svarinu (ein raunveruleg vefumferð á hverja
 *    síðuhleðslu, óháð fjölda auglýsingaplássa) NÁKVÆMLEGA EINU SINNI á hverja síðu — óháð því hversu
 *    mörg <BirtingurAdSlot> eru á síðunni — með sömu global-flögg aðferð og JS snippet-ið notar.
 */

/**
 * Headless component fyrir Birtingur Serving REST API.
 * Kemur í veg fyrir Layout Shift (CLS) með því að taka frá pláss með tilgreindri hæð/breidd.
 * Uppfærir sig sjálfkrafa byggt á TTL úr svari þegar auglýsingin er í viewport.
 */
export function BirtingurAdSlot({
  slotId,
  width,
  height,
  sizes,
  onLoadStatus,
  className = '',
}: Props) {
  const [ad, setAd] = useState<BirtingurResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isVisible, setIsVisible] = useState(false);
  const impressionFired = useRef<string | null>(null);
  const pageviewFired = useRef(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const fetchAdRef = useRef<(() => Promise<void>) | null>(null);

  // Mæla skjáinn dýnamískt ef sizes eru skilgreind
  const [activeSize, setActiveSize] = useState<{ w: number; h: number }>(() => {
    if (typeof window === 'undefined') {
      if (width && height) return { w: width, h: height };
      if (sizes?.desktop) return sizes.desktop;
      if (sizes?.tablet) return sizes.tablet;
      if (sizes?.mobile) return sizes.mobile;
      return { w: 0, h: 0 };
    }
    return getMatchingSize(window.innerWidth);
  });

  function getMatchingSize(winWidth: number): { w: number; h: number } {
    if (sizes) {
      if (winWidth < 768 && sizes.mobile) return sizes.mobile;
      if (winWidth >= 768 && winWidth < 1024 && sizes.tablet) {
        return sizes.tablet || sizes.desktop || sizes.mobile;
      }
      if (winWidth >= 1024 && sizes.desktop) return sizes.desktop;
      const fallback = sizes.desktop || sizes.tablet || sizes.mobile;
      if (fallback) return fallback;
    }
    return { w: width || 0, h: height || 0 };
  }

  useEffect(() => {
    if (!sizes) return;
    const handleResize = () => {
      const matched = getMatchingSize(window.innerWidth);
      setActiveSize((prev) => {
        if (prev.w === matched.w && prev.h === matched.h) return prev;
        return matched;
      });
    };
    window.addEventListener('resize', handleResize);
    handleResize();
    return () => window.removeEventListener('resize', handleResize);
  }, [sizes, width, height]);

  // Fylgjast með því hvort plássið sé sýnilegt í viewport
  useEffect(() => {
    if (typeof window === 'undefined' || !('IntersectionObserver' in window) || !containerRef.current) {
      setIsVisible(true);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        setIsVisible(entry.isIntersecting);
      },
      { threshold: 0.1 } // Sýnilegt að einhverju leyti til að keyra TTL timer
    );

    observer.observe(containerRef.current);
    return () => {
      observer.disconnect();
    };
  }, []);

  // Sækja auglýsingu úr API
  useEffect(() => {
    let cancelled = false;
    const fetchAd = async () => {
      try {
        setLoading(true);
        setError(null);
        // Senda breidd og hæð í veffyrirspurn ef þær liggja fyrir
        const sizeParams = activeSize.w && activeSize.h ? \`&w=\${activeSize.w}&h=\${activeSize.h}\` : '';
        const res = await fetch(
          \`\${SERVING_BASE}/v1/ad?slot=\${encodeURIComponent(slotId)}&consent=none\${sizeParams}\`,
          { cache: 'no-store' }
        );
        if (!res.ok) {
          let errMsg = \`Birtingur fetch villa: \${res.status}\`;
          try {
            const errJson = await res.json();
            if (errJson && typeof errJson === 'object' && 'error' in errJson) {
              errMsg = \`\${errMsg} - \${errJson.error}\`;
            }
          } catch {}
          throw new Error(errMsg);
        }
        const data = (await res.json()) as BirtingurResponse;
        if (!cancelled) {
          setAd(data);
        }
      } catch (err: any) {
        console.error('Birtingur fetch villa:', err);
        if (!cancelled) {
          setError(err.message || 'Óþekkt villa við að sækja auglýsingu');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchAdRef.current = fetchAd;
    fetchAd();

    return () => {
      cancelled = true;
    };
  }, [slotId, activeSize.w, activeSize.h]);

  // Kalla á onLoadStatus þegar staða breytist
  useEffect(() => {
    if (!onLoadStatus) return;
    if (loading) {
      onLoadStatus('loading');
    } else if (error) {
      onLoadStatus('error');
    } else if (!ad || 'empty' in ad || HIDDEN_FALLBACKS.has(ad.creativeId)) {
      onLoadStatus('empty');
    } else {
      onLoadStatus('loaded');
    }
  }, [loading, error, ad, onLoadStatus]);

  // Sjálfvirk uppfærsla (Auto-Refresh) byggt á TTL úr svari, en AÐEINS þegar plássið er sýnilegt (isVisible)
  useEffect(() => {
    if (!isAd(ad) || !isVisible) return;

    const ttlMs = ad.ttl * 1000;

    const timer: ReturnType<typeof setTimeout> = setTimeout(() => {
      if (fetchAdRef.current) {
        fetchAdRef.current();
      }
    }, ttlMs);

    return () => {
      clearTimeout(timer);
    };
  }, [ad, isVisible]);

  // Áhorfsmæling (Impression Tracking) með stuðningi við Viewability (IntersectionObserver).
  useEffect(() => {
    if (!isAd(ad)) return;
    if (impressionFired.current === ad.creativeId) return;

    const targetUrl = ad.impressionPixel.startsWith('http')
      ? ad.impressionPixel
      : \`\${SERVING_BASE}\${ad.impressionPixel}\`;

    const fireImpression = () => {
      impressionFired.current = ad.creativeId;
      const img = new Image();
      img.src = targetUrl;
    };

    if (typeof window !== 'undefined' && 'IntersectionObserver' in window && containerRef.current) {
      let timer: ReturnType<typeof setTimeout>;
      const observer = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting) {
              // IAB standard: 50% sýnilegt í 1 samfellda sekúndu
              timer = setTimeout(() => {
                fireImpression();
                observer.disconnect();
              }, 1000);
            } else {
              clearTimeout(timer);
            }
          });
        },
        { threshold: 0.5 }
      );
      observer.observe(containerRef.current);
      return () => {
        clearTimeout(timer);
        observer.disconnect();
      };
    } else {
      fireImpression();
    }
  }, [ad]);

  // Fire pageview tracking pixel for empty responses (cache miss with no
  // pageviewPixel of its own — impressionPixel is tagged type=pageview server
  // side and is the only signal available in that case).
  useEffect(() => {
    if (!ad || pageviewFired.current) return;
    if ('empty' in ad && ad.impressionPixel) {
      pageviewFired.current = true;
      const url = ad.impressionPixel.startsWith('http')
        ? ad.impressionPixel
        : \`\${SERVING_BASE}\${ad.impressionPixel}\`;
      const img = new Image();
      img.src = url;
    }
  }, [ad]);

  // Fire the real page-view pixel once per page load (not once per slot) for a
  // filled or fallback response. Without this, publishers using this component
  // only ever fire impressionPixel (once per slot) and their "Vefumferð" figure
  // in the dashboard stays "—" forever even though their slots keep loading.
  useEffect(() => {
    if (!isAd(ad) || !ad.pageviewPixel) return;
    firePageviewOnce(ad.pageviewPixel);
  }, [ad]);

  if (loading) {
    return (
      <div
        style={{ width: activeSize.w || '100%', height: activeSize.h || 'auto' }}
        className={\`bg-gray-100 animate-pulse rounded-lg border border-gray-200 flex items-center justify-center \${className}\`}
      >
        <span className="text-[10px] text-gray-300 uppercase tracking-widest font-bold">
          Sæki Auglýsingu
        </span>
      </div>
    );
  }

  // Ef villa átti sér stað, ef ekkert pláss fannst, eða ef um er að ræða ósýnilegt fallback.
  if (error || !isAd(ad) || HIDDEN_FALLBACKS.has(ad.creativeId)) {
    if (error) {
      console.warn('Birtingur load error, rendering transparent fallback:', error);
    }
    return (
      <div
        ref={containerRef}
        style={{ width: activeSize.w || '100%', height: 1 }}
        aria-hidden="true"
        className={className}
      >
        <img
          src="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7"
          alt=""
          width={1}
          height={1}
          style={{ width: 1, height: 1, opacity: 0 }}
        />
      </div>
    );
  }

  const clickUrl = ad.clickUrl.startsWith('http')
    ? ad.clickUrl
    : \`\${SERVING_BASE}\${ad.clickUrl}\`;

  return (
    <div
      ref={containerRef}
      style={{ width: activeSize.w || '100%', height: activeSize.h || 'auto' }}
      className={\`relative overflow-hidden rounded-xl border border-gray-200 shadow-sm hover:shadow bg-gray-50 ad-slot \${className}\`}
    >
      <a
        href={clickUrl}
        target="_blank"
        rel="noopener noreferrer sponsored"
        className="block w-full h-full"
      >
        <img
          src={ad.imageUrl}
          alt="Auglýsing frá Birtingur"
          width={ad.width}
          height={ad.height}
          className="w-full h-full object-cover"
        />
      </a>
    </div>
  );
}`;

/**
 * Builds the integration doc: the BirtingurAdSlot component plus a ready-to-paste usage
 * example with this slot's real ID and dimensions baked in. Pure (no I/O) so it is unit
 * tested directly.
 */
export function buildBirtingurReactDoc(opts: {
  slotId: string;
  width: number;
  height: number;
  supportedSizes?: Array<{ width: number; height: number }>;
}): string {
  const { slotId, width, height, supportedSizes } = opts;

  let responsiveSnippet = '';
  if (supportedSizes && supportedSizes.length > 1) {
    const mobile = supportedSizes.find((s) => s.width < 500);
    const desktop = supportedSizes.find((s) => s.width >= 700);
    const tablet = supportedSizes.find((s) => s.width >= 500 && s.width < 700);

    const parts: string[] = [];
    if (mobile) parts.push(`mobile: { w: ${mobile.width}, h: ${mobile.height} }`);
    if (tablet) parts.push(`tablet: { w: ${tablet.width}, h: ${tablet.height} }`);
    if (desktop) parts.push(`desktop: { w: ${desktop.width}, h: ${desktop.height} }`);

    if (parts.length > 0) {
      responsiveSnippet = `

--- VALKOSTUR 2: MÓTTÆKILEG NOTKUN (RESPONSIVE USAGE) ---
Hentar þegar plássið getur haft mismunandi stærð eftir tækjum (t.d. farsímar vs. tölvur).
Íhluturinn hlustar sjálfkrafa á stærðarbreytingar á glugga og sækir rétta auglýsingu:

<BirtingurAdSlot
  slotId="${slotId}"
  sizes={{
    ${parts.join(',\n    ')}
  }}
  onLoadStatus={(status) => {
    console.log('Staða auglýsingar:', status);
    // Hægt að nota status ('empty' | 'loaded' | 'error') til að fela ytri gáma
  }}
/>`;
    }
  }

  return `${COMPONENT_CODE}

--- VALKOSTUR 1: FAST STÆRÐ (FIXED SIZE USAGE) ---
Límdu þetta inn þar sem auglýsingin á að birtast. Slot-ID er FAST gildi fyrir þetta pláss:

<BirtingurAdSlot slotId="${slotId}" width={${width}} height={${height}} />${responsiveSnippet}

RÁÐ: Bakaðu slotId beint inn sem streng eins og sýnt er hér að ofan. Forðist env-breytur (NEXT_PUBLIC_*)
sem gætu verið undefined í keyrslu — þá skilar API-ið {empty:true} fyrir óþekkt pláss.`;
}

export function registerGetReactComponent(server: McpServer, apiKey: string) {
  server.registerTool(
    'get_react_component',
    {
      title: 'Sækja React/Next.js samþættingarkóða',
      description:
        'Sækir tilbúinn React client-side component (<BirtingurAdSlot>) ÁSAMT tilbúnu notkunardæmi með réttu slot-ID baked inn. Styður nú responsive stærðir og onLoadStatus callbacks.',
      inputSchema: Input.shape,
    },
    async ({ slotId, width, height }) => {
      const slot = await apiCall<{ id: string; sizes: Array<{ width: number; height: number }> }>(
        `/v1/publishers/me/slots/${slotId}`,
        { apiKey },
      );
      let w = width;
      let h = height;
      if (w == null || h == null) {
        const def = slot.sizes?.[0];
        if (!def) {
          throw new Error(`Slot ${slotId} hefur engar stærðir skilgreindar`);
        }
        w = def.width;
        h = def.height;
      }
      const text = buildBirtingurReactDoc({
        slotId: slot.id,
        width: w,
        height: h,
        supportedSizes: slot.sizes,
      });
      return { content: [{ type: 'text' as const, text }] };
    },
  );
}
