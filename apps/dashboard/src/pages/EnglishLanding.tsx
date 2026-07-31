import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import PublicHeader from '@/components/layout/PublicHeader';
import PublicFooter from '@/components/layout/PublicFooter';
import { updateSEO } from '@/lib/seo';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Eyebrow, BigFigure, PillButton } from '@/components/ui/editorial';
import type { WaitlistRole } from '@ada/shared/types';
import { AD_CATEGORIES } from '@ada/shared';

const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:3001';
const CATEGORY_LABELS = AD_CATEGORIES.map((c) => c.label.split(' & ')[0]);

export default function EnglishLanding() {
  const navigate = useNavigate();
  const [role, setRole] = useState<WaitlistRole>('advertiser');
  const [email, setEmail] = useState('');
  const [websiteUrl, setWebsiteUrl] = useState('');
  const [category, setCategory] = useState('');
  const [status, setStatus] = useState<'idle' | 'submitting' | 'success' | 'error'>('idle');
  const [message, setMessage] = useState('');

  useEffect(() => {
    updateSEO(
      'Birtingur — The Privacy-First Category Display Network',
      'Join the global waitlist for Birtingur: a cookie-free, privacy-first ad network connecting niche creators and forward-thinking brands directly by interest category.',
      '/en',
    );

    const schemaData = {
      '@context': 'https://schema.org',
      '@type': 'SoftwareApplication',
      name: 'Birtingur',
      applicationCategory: 'BusinessApplication',
      operatingSystem: 'All',
      description: 'Privacy-first category ad network connecting niche creators and brands.',
      url: 'https://www.birtingur.app/en',
      offers: {
        '@type': 'Offer',
        price: '0',
        priceCurrency: 'USD',
      },
    };

    let script = document.getElementById('jsonld-english-landing');
    if (!script) {
      script = document.createElement('script');
      script.id = 'jsonld-english-landing';
      script.setAttribute('type', 'application/ld+json');
      document.head.appendChild(script);
    }
    script.textContent = JSON.stringify(schemaData);

    return () => {
      if (script && script.parentNode) {
        script.parentNode.removeChild(script);
      }
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;

    setStatus('submitting');
    setMessage('');

    try {
      const res = await fetch(`${API_BASE}/v1/waitlist`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          role,
          websiteUrl: websiteUrl || undefined,
          category: category || undefined,
        }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setStatus('success');
        setMessage(data.message || 'Thank you for joining the waitlist!');
        setEmail('');
        setWebsiteUrl('');
        setCategory('');
      } else {
        setStatus('error');
        setMessage(data.message || 'Something went wrong. Please check your email address.');
      }
    } catch {
      setStatus('error');
      setMessage('Failed to connect to the server. Please try again in a moment.');
    }
  };

  const changeTab = (tab: string) => {
    if (tab === 'advertisers') navigate('/auglysendur');
    else if (tab === 'publishers') navigate('/midlar');
    else if (tab === 'faq') navigate('/faq');
    else if (tab === 'terms') navigate('/skilmalar');
    else navigate('/');
  };

  return (
    <div className="flex min-h-screen flex-col bg-white font-sans text-slate-900 antialiased selection:bg-primary selection:text-white">
      {/* INFORMATIONAL BANNER BAR */}
      <div className="flex flex-wrap items-center justify-center gap-2 border-b border-slate-200 bg-slate-50 px-4 py-2.5 text-center text-xs font-medium text-slate-600 sm:text-sm">
        <span className="shrink-0 rounded-full bg-primary/10 px-2.5 py-0.5 text-[10px] font-bold tracking-wider text-primary uppercase">
          Global Demand Testing
        </span>
        <span>
          Birtingur is expanding its privacy-first ad network internationally.{' '}
          <a
            href="#waitlist-form"
            className="font-bold text-primary underline hover:text-primary-800"
          >
            Join the early access waitlist below!
          </a>
        </span>
      </div>

      {/* HEADER */}
      <PublicHeader onTabChange={changeTab} currentTab="home" />

      <main className="grow">
        {/* HERO SECTION */}
        <section
          style={{ paddingTop: 'clamp(64px,8vw,108px)', paddingBottom: 'clamp(56px,7vw,88px)' }}
        >
          <div
            className="mx-auto"
            style={{
              maxWidth: 1180,
              paddingLeft: 'clamp(24px,5vw,72px)',
              paddingRight: 'clamp(24px,5vw,72px)',
            }}
          >
            <Eyebrow className="mb-4">Global Waitlist & Early Access</Eyebrow>

            <h1
              className="m-0 max-w-[18ch] font-extrabold text-slate-900"
              style={{
                fontSize: 'clamp(42px,7vw,96px)',
                letterSpacing: '-0.035em',
                lineHeight: 0.98,
                textWrap: 'balance',
              }}
            >
              Advertise by interest, not by tracking cookies
            </h1>

            <div className="mt-8 grid grid-cols-1 gap-12 lg:grid-cols-12 lg:items-start">
              {/* LEFT COL: EDITORIAL EXPLANATION */}
              <div className="lg:col-span-6">
                <p className="m-0 text-lg leading-relaxed text-slate-600 sm:text-xl">
                  Birtingur is the self-service category display ad platform connecting niche
                  digital creators and lifestyle blogs directly with brands. Zero third-party
                  tracking, 100% cookie-free, and simple flat-CPM pricing.
                </p>

                {/* CATEGORY TICKER PILLS */}
                <div className="mt-8">
                  <span className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-3">
                    Active Content Categories
                  </span>
                  <div className="flex flex-wrap gap-2">
                    {CATEGORY_LABELS.map((lbl) => (
                      <span
                        key={lbl}
                        className="rounded-full bg-slate-100 px-3.5 py-1.5 text-xs font-semibold text-slate-700 border border-slate-200"
                      >
                        {lbl}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="mt-10 grid grid-cols-2 gap-6 border-t border-slate-200 pt-8">
                  <div>
                    <BigFigure value="80%" suffix="Payout Share" />
                    <p className="mt-2 text-xs font-medium text-slate-500">
                      Transparent creator revenue share
                    </p>
                  </div>
                  <div>
                    <BigFigure value="100%" suffix="Cookie-Free" />
                    <p className="mt-2 text-xs font-medium text-slate-500">
                      Full GDPR compliance by design
                    </p>
                  </div>
                </div>
              </div>

              {/* RIGHT COL: WAITLIST FORM CARD */}
              <div className="lg:col-span-6" id="waitlist-form">
                <Card className="p-6 md:p-8 bg-white shadow-xl rounded-2xl border border-slate-200">
                  <h2 className="m-0 text-xl font-extrabold text-slate-900 tracking-tight mb-2">
                    Reserve Your Early Access Spot
                  </h2>
                  <p className="text-sm text-slate-500 mb-6">
                    Be the first to know when we open new categories in your region.
                  </p>

                  <div className="mb-6">
                    <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">
                      I am joining as a
                    </label>
                    <div className="flex flex-wrap gap-2">
                      <PillButton
                        active={role === 'advertiser'}
                        onClick={() => setRole('advertiser')}
                      >
                        Brand / Advertiser
                      </PillButton>
                      <PillButton
                        active={role === 'publisher'}
                        onClick={() => setRole('publisher')}
                      >
                        Creator / Publisher
                      </PillButton>
                      <PillButton active={role === 'both'} onClick={() => setRole('both')}>
                        Both
                      </PillButton>
                    </div>
                  </div>

                  {status === 'success' ? (
                    <div className="p-5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-center">
                      <span className="text-3xl mb-2 block">🎉</span>
                      <p className="font-extrabold text-lg">{message}</p>
                      <p className="text-xs mt-2 text-emerald-700 leading-normal">
                        Your spot is reserved! We will notify you as soon as early access expands to
                        your content category.
                      </p>
                      <Button
                        variant="secondary"
                        className="mt-5 text-xs"
                        onClick={() => setStatus('idle')}
                      >
                        Register Another Email
                      </Button>
                    </div>
                  ) : (
                    <form onSubmit={handleSubmit} className="space-y-4">
                      <div>
                        <label
                          className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5"
                          htmlFor="waitlist-email"
                        >
                          Work Email Address <span className="text-rose-500">*</span>
                        </label>
                        <input
                          id="waitlist-email"
                          type="email"
                          required
                          placeholder="name@company.com"
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          className="w-full px-4 py-3 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-primary/50 text-slate-900 text-sm font-medium"
                        />
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                          <label
                            className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5"
                            htmlFor="waitlist-website"
                          >
                            Website / Channel URL
                          </label>
                          <input
                            id="waitlist-website"
                            type="url"
                            placeholder="https://myblog.com"
                            value={websiteUrl}
                            onChange={(e) => setWebsiteUrl(e.target.value)}
                            className="w-full px-4 py-3 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-primary/50 text-slate-900 text-sm font-medium"
                          />
                        </div>
                        <div>
                          <label
                            className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5"
                            htmlFor="waitlist-category"
                          >
                            Primary Category
                          </label>
                          <input
                            id="waitlist-category"
                            type="text"
                            placeholder="Food, Tech, Travel..."
                            value={category}
                            onChange={(e) => setCategory(e.target.value)}
                            className="w-full px-4 py-3 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-primary/50 text-slate-900 text-sm font-medium"
                          />
                        </div>
                      </div>

                      {status === 'error' && (
                        <p className="text-xs text-rose-600 font-semibold">{message}</p>
                      )}

                      <Button
                        type="submit"
                        variant="primary"
                        disabled={status === 'submitting'}
                        className="w-full py-3.5 text-base font-bold shadow-lg shadow-primary/20 mt-2"
                      >
                        {status === 'submitting'
                          ? 'Joining Waitlist...'
                          : 'Join Early Access Waitlist →'}
                      </Button>

                      <p className="text-[11px] text-center text-slate-400 mt-2">
                        🔒 Privacy first. No tracking cookies. Zero spam.
                      </p>
                    </form>
                  )}
                </Card>
              </div>
            </div>
          </div>
        </section>

        {/* THREE CORE PILLARS SECTION */}
        <section className="py-20 bg-slate-50 border-t border-slate-200">
          <div
            className="mx-auto"
            style={{
              maxWidth: 1180,
              paddingLeft: 'clamp(24px,5vw,72px)',
              paddingRight: 'clamp(24px,5vw,72px)',
            }}
          >
            <div className="text-center max-w-2xl mx-auto mb-14">
              <Eyebrow>Why Birtingur</Eyebrow>
              <h2 className="m-0 text-3xl font-extrabold text-slate-900 tracking-tight sm:text-4xl mt-2">
                Built for Niche Creators & Modern Brands
              </h2>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              <Card className="p-8 bg-white border border-slate-200 rounded-2xl shadow-sm">
                <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center text-primary text-xl font-bold mb-5">
                  01
                </div>
                <h3 className="m-0 text-xl font-bold text-slate-900">Category Network Buying</h3>
                <p className="mt-3 text-sm text-slate-600 leading-relaxed">
                  Advertisers don’t need to negotiate individual site deals. Buy by audience
                  interest (e.g. food lovers) and your ad serves across every site in that category.
                </p>
              </Card>

              <Card className="p-8 bg-white border border-slate-200 rounded-2xl shadow-sm">
                <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center text-primary text-xl font-bold mb-5">
                  02
                </div>
                <h3 className="m-0 text-xl font-bold text-slate-900">100% Cookie-Free Privacy</h3>
                <p className="mt-3 text-sm text-slate-600 leading-relaxed">
                  No third-party tracking cookies, no invasive user profiling, and no cross-site
                  surveillance. Frequency capping uses first-party consent-gated tokens.
                </p>
              </Card>

              <Card className="p-8 bg-white border border-slate-200 rounded-2xl shadow-sm">
                <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center text-primary text-xl font-bold mb-5">
                  03
                </div>
                <h3 className="m-0 text-xl font-bold text-slate-900">Fair & Transparent Fees</h3>
                <p className="mt-3 text-sm text-slate-600 leading-relaxed">
                  Creators keep 80% of net advertising revenue. Fixed CPM pricing means predictable
                  ad spend for brands without opaque programmatic auction taxes.
                </p>
              </Card>
            </div>
          </div>
        </section>
      </main>

      {/* FOOTER */}
      <PublicFooter onTabChange={changeTab} />
    </div>
  );
}
