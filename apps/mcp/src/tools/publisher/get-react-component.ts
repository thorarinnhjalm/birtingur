import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

const Input = z.object({});

export function registerGetReactComponent(server: McpServer) {
  server.registerTool(
    'get_react_component',
    {
      title: 'Sækja React/Next.js samþættingarkóða',
      description:
        'Sækir tilbúinn React client-side component (<BirtingurAdSlot>) sem höndlar rétt birtingar, smelltengingar, 1x1 gegnsætt fallback án layout shifts, og viewability mælingar.',
      inputSchema: Input.shape,
    },
    async () => {
      const componentCode = `'use client';

import { useEffect, useRef, useState } from 'react';

const SERVING_BASE = 'https://serving.birtingur.app';
const FALLBACK_CREATIVES = ['cre_fallback_transparent', 'cre_fallback_birtingur'];

interface BirtingurAd {
  creativeId: string;
  imageUrl: string;
  clickUrl: string;
  width: number;
  height: number;
  impressionPixel: string;
  ttl: number;
}

interface BirtingurEmpty {
  empty: true;
}

type BirtingurResponse = BirtingurAd | BirtingurEmpty;

function isAd(r: BirtingurResponse | null): r is BirtingurAd {
  return !!r && !('empty' in r);
}

interface Props {
  slotId: string;
  width: number;
  height: number;
  className?: string;
}

/**
 * LEIÐBEININGAR UM VILLUMEÐHÖNDLUN (ERROR HANDLING GUIDELINES):
 * 1. Component-inn reynir að lesa JSON villuskilaboð á borð við { error: "skilaboð", code: "..." } ef vefþjónn skilar ekki 200 OK.
 * 2. Ef villa kemur upp er hún skráð í console logga (warning/error) til að auðvelda greiningu í þróun.
 * 3. Í framleiðsluumhverfi (production) fellur component-inn plássið saman sjálfkrafa (renderar gagnsætt fallback)
 *    til að tryggja að notendaupplifun skemmist ekki og engin ljót villuboð sjáist á síðunni.
 */

/**
 * Headless component fyrir Birtingur Serving REST API.
 * Kemur í veg fyrir Layout Shift (CLS) með því að taka frá pláss með tilgreindri hæð/breidd.
 * Uppfærir sig sjálfkrafa byggt á TTL úr svari þegar auglýsingin er í viewport.
 */
export function BirtingurAdSlot({ slotId, width, height, className = '' }: Props) {
  const [ad, setAd] = useState<BirtingurResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isVisible, setIsVisible] = useState(false);
  const impressionFired = useRef<string | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const fetchAdRef = useRef<() => Promise<void>>();

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
        setError(null);
        // Ath: Hægt er að breyta consent=none í consent=full ef notandi hefur gefið vafrakökusamþykki (GDPR/CMP)
        const res = await fetch(
          \`\${SERVING_BASE}/v1/ad?slot=\${encodeURIComponent(slotId)}&consent=none\`,
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
  }, [slotId]);

  // Sjálfvirk uppfærsla (Auto-Refresh) byggt á TTL úr svari, en AÐEINS þegar plássið er sýnilegt (isVisible)
  useEffect(() => {
    if (!isAd(ad) || !isVisible) return;

    // ttl er í sekúndum í svarinu. Umbreytum í millisekúndur.
    const ttlMs = ad.ttl * 1000;

    const timer = setTimeout(() => {
      if (fetchAdRef.current) {
        fetchAdRef.current();
      }
    }, ttlMs);

    return () => {
      clearTimeout(timer);
    };
  }, [ad, isVisible]);

  // Áhorfsmæling (Impression Tracking) með stuðningi við Viewability (IntersectionObserver).
  // Mælt er með að telja áhorf aðeins þegar plássið er sýnilegt (t.d. 50% í 1 sek).
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
      let timer: NodeJS.Timeout;
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
      // Fallback ef IntersectionObserver er ekki studdur: telja strax
      fireImpression();
    }
  }, [ad]);

  if (loading) {
    return (
      <div
        style={{ width, height }}
        className=\`bg-gray-100 animate-pulse rounded-lg border border-gray-200 flex items-center justify-center \${className}\`
      >
        <span className="text-[10px] text-gray-300 uppercase tracking-widest font-bold">
          Sæki Auglýsingu
        </span>
      </div>
    );
  }

  // Ef villa átti sér stað, ef ekkert pláss fannst, eða ef um er að ræða gagnsætt fallback (cre_fallback_transparent)
  if (error || !isAd(ad) || ad.creativeId === 'cre_fallback_transparent') {
    if (error) {
      console.warn('Birtingur load error, rendering transparent fallback:', error);
    }
    return (
      <div
        ref={containerRef}
        style={{ width, height }}
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
    <div ref={containerRef} style={{ width, height }} className=\`relative overflow-hidden rounded-xl border border-gray-200 shadow-sm hover:shadow bg-gray-50 ad-slot \${className}\`>
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

      return { content: [{ type: 'text' as const, text: componentCode }] };
    },
  );
}
