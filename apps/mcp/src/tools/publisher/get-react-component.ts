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
 * Headless component fyrir Birtingur Serving REST API.
 * Kemur í veg fyrir Layout Shift (CLS) með því að taka frá pláss með tilgreindri hæð/breidd.
 */
export function BirtingurAdSlot({ slotId, width, height, className = '' }: Props) {
  const [ad, setAd] = useState<BirtingurResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const impressionFired = useRef<string | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function fetchAd() {
      try {
        const res = await fetch(
          \`\${SERVING_BASE}/v1/ad?slot=\${encodeURIComponent(slotId)}&consent=none\`,
          { cache: 'no-store' }
        );
        if (!res.ok) throw new Error(\`Birtingur fetch villa: \${res.status}\`);
        const data = (await res.json()) as BirtingurResponse;
        if (!cancelled) setAd(data);
      } catch (err) {
        console.error('Birtingur fetch villa:', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    fetchAd();
    return () => {
      cancelled = true;
    };
  }, [slotId]);

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

  // Ef ekkert pláss fannst eða gagnsætt fallback (cre_fallback_transparent)
  if (!isAd(ad) || ad.creativeId === 'cre_fallback_transparent') {
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
