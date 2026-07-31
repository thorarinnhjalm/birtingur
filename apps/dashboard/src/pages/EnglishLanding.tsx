import { useState, useEffect } from 'react';
import { updateSEO } from '@/lib/seo';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Eyebrow, BigFigure, PillButton } from '@/components/ui/editorial';
import type { WaitlistRole } from '@ada/shared/types';
import { AD_CATEGORIES } from '@ada/shared';
import Logo from '@/components/ui/Logo';

const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:3001';

// Mapped English Category Labels for International SEO & UX
const ENGLISH_CATEGORY_MAP: Record<string, string> = {
  matur: 'Food & Culinary',
  ferdalog: 'Travel & Outdoors',
  tiska_fegurd: 'Fashion & Beauty',
  taekni: 'Tech & Innovation',
  heilsa_likamsraekt: 'Health & Fitness',
  fjarmal_vidskipti: 'Business & Finance',
  ithrottir: 'Sports & Athletics',
  born_foreldrar: 'Parenting & Family',
  bilar: 'Automotive & Transport',
  heimili_honnun: 'Home & Interior Design',
  afthreying_menning: 'Entertainment & Culture',
  dyr_gaeludyr: 'Pets & Animals',
};

const ENGLISH_CATEGORIES = AD_CATEGORIES.map(
  (c) => ENGLISH_CATEGORY_MAP[c.slug] || c.label.split(' & ')[0],
);

const ENGLISH_FAQS = [
  {
    q: 'How does Birtingur operate 100% cookie-free?',
    a: 'Unlike legacy programmatic networks that drop third-party tracking cookies across reader browsers, Birtingur serves ads entirely in-context based on interest categories. Frequency capping uses first-party consent-gated tokens stored strictly in the publisher’s origin. No user profiling, no cross-site tracking.',
  },
  {
    q: 'How do digital creators and bloggers earn money?',
    a: 'Creators embed a single lightweight, size-budgeted script snippet on their site. Whenever ads serve in their declared content categories, creators receive 80% of net advertising revenue with complete real-time dashboard transparency.',
  },
  {
    q: 'What makes Category Network Buying better than traditional ad buying?',
    a: 'Traditional programmatic ad buying is bogged down by middleman tax, auction bidding wars, and intrusive tracker scripts that slow down websites. Birtingur lets brands buy an entire interest category (e.g. Food & Culinary) with a single campaign budget at a transparent flat CPM price.',
  },
  {
    q: 'Is Birtingur fully GDPR and ePrivacy compliant?',
    a: 'Yes. By eliminating third-party cookies, tracking beacons, and invasive user profiling, Birtingur is built privacy-first by design. Websites embedding Birtingur retain reader trust without complex cookie banner obligations.',
  },
  {
    q: 'When will international campaign buying open for my region?',
    a: 'We are currently onboarding creators and brands by region and category. Joining the waitlist reserves your early access spot and ensures your category is prioritized for commercial launch.',
  },
];

export default function EnglishLanding() {
  const [role, setRole] = useState<WaitlistRole>('advertiser');
  const [email, setEmail] = useState('');
  const [websiteUrl, setWebsiteUrl] = useState('');
  const [category, setCategory] = useState('');
  const [status, setStatus] = useState<'idle' | 'submitting' | 'success' | 'error'>('idle');
  const [message, setMessage] = useState('');
  const [openFaq, setOpenFaq] = useState<number | null>(0);

  useEffect(() => {
    updateSEO(
      'Birtingur — Cookie-Free Category Display Ad Network for Niche Creators & Brands',
      'Birtingur is the privacy-first, cookie-free display ad network connecting niche bloggers and digital creators directly with brands by interest category. Join the global waitlist.',
      '/en',
    );

    const schemaData = {
      '@context': 'https://schema.org',
      '@graph': [
        {
          '@type': 'SoftwareApplication',
          name: 'Birtingur',
          applicationCategory: 'BusinessApplication',
          operatingSystem: 'All',
          description: 'Privacy-first category display ad network connecting creators and brands.',
          url: 'https://www.birtingur.app/en',
        },
        {
          '@type': 'FAQPage',
          mainEntity: ENGLISH_FAQS.map((faq) => ({
            '@type': 'Question',
            name: faq.q,
            acceptedAnswer: {
              '@type': 'Answer',
              text: faq.a,
            },
          })),
        },
      ],
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

  return (
    <div className="flex min-h-screen flex-col bg-white font-sans text-slate-900 antialiased selection:bg-primary selection:text-white">
      {/* INFORMATIONAL BANNER BAR */}
      <div className="flex flex-wrap items-center justify-center gap-2 border-b border-slate-200 bg-slate-50 px-4 py-2.5 text-center text-xs font-medium text-slate-600 sm:text-sm">
        <span className="shrink-0 rounded-full bg-primary/10 px-2.5 py-0.5 text-[10px] font-bold tracking-wider text-primary uppercase">
          Global Early Access
        </span>
        <span>
          Birtingur is expanding its privacy-first category ad network globally.{' '}
          <a
            href="#waitlist-form"
            className="font-bold text-primary underline hover:text-primary-800"
          >
            Join the early access waitlist →
          </a>
        </span>
      </div>

      {/* DEDICATED CLEAN ENGLISH HEADER */}
      <header className="sticky top-0 z-40 border-b border-slate-200/80 bg-white/90 backdrop-blur-md">
        <div className="mx-auto flex h-20 max-w-6xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <a href="/en" className="flex items-center gap-2 text-slate-900 no-underline">
              <Logo className="h-8 w-auto text-primary" />
            </a>
            <span className="rounded-full bg-slate-100 border border-slate-200 px-2.5 py-0.5 text-[11px] font-bold text-slate-600 uppercase tracking-wider">
              Global Beta
            </span>
          </div>

          <div>
            <a href="#waitlist-form">
              <Button variant="primary" className="text-xs font-bold py-2.5 px-4">
                Join Waitlist →
              </Button>
            </a>
          </div>
        </div>
      </header>

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
            <Eyebrow className="mb-4">Cookie-Free Category Display Network</Eyebrow>

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
                  Birtingur connects niche digital creators and lifestyle blogs directly with
                  forward-thinking brands. Zero third-party cookies, full GDPR privacy by design,
                  and transparent flat-CPM category buying.
                </p>

                {/* ENGLISH CATEGORY TICKER PILLS */}
                <div className="mt-8">
                  <span className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-3">
                    Active Content Categories (English Taxonomy)
                  </span>
                  <div className="flex flex-wrap gap-2">
                    {ENGLISH_CATEGORIES.map((lbl) => (
                      <span
                        key={lbl}
                        className="rounded-full bg-slate-100 px-3.5 py-1.5 text-xs font-semibold text-slate-700 border border-slate-200 hover:border-primary/40 hover:bg-primary/5 transition-colors"
                      >
                        {lbl}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="mt-10 grid grid-cols-2 gap-6 border-t border-slate-200 pt-8">
                  <div>
                    <BigFigure value="80%" suffix="Revenue Share" />
                    <p className="mt-2 text-xs font-medium text-slate-500">
                      Transparent payout share for creators
                    </p>
                  </div>
                  <div>
                    <BigFigure value="100%" suffix="Cookie-Free" />
                    <p className="mt-2 text-xs font-medium text-slate-500">
                      Zero tracking cookies or cross-site profiling
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
                    Join creators and brands testing Birtingur in international markets.
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

        {/* 3-STEP HOW IT WORKS */}
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
              <Eyebrow>How It Works</Eyebrow>
              <h2 className="m-0 text-3xl font-extrabold text-slate-900 tracking-tight sm:text-4xl mt-2">
                Simpler Ad Buying & Creator Monetization
              </h2>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              <Card className="p-8 bg-white border border-slate-200 rounded-2xl shadow-sm">
                <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center text-primary text-xl font-extrabold mb-5">
                  01
                </div>
                <h3 className="m-0 text-xl font-bold text-slate-900">Select Interest Category</h3>
                <p className="mt-3 text-sm text-slate-600 leading-relaxed">
                  Brands pick their target categories (Food & Culinary, Tech, Travel). Ads
                  automatically serve across every verified creator site in that interest cluster.
                </p>
              </Card>

              <Card className="p-8 bg-white border border-slate-200 rounded-2xl shadow-sm">
                <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center text-primary text-xl font-extrabold mb-5">
                  02
                </div>
                <h3 className="m-0 text-xl font-bold text-slate-900">
                  Cookie-Free Lightweight Code
                </h3>
                <p className="mt-3 text-sm text-slate-600 leading-relaxed">
                  Creators paste a single size-budgeted JavaScript snippet on their blog. Zero
                  third-party tracking cookies or site performance penalties.
                </p>
              </Card>

              <Card className="p-8 bg-white border border-slate-200 rounded-2xl shadow-sm">
                <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center text-primary text-xl font-extrabold mb-5">
                  03
                </div>
                <h3 className="m-0 text-xl font-bold text-slate-900">
                  Transparent Payouts & Stats
                </h3>
                <p className="mt-3 text-sm text-slate-600 leading-relaxed">
                  Real-time analytics updated hourly. Creators receive an 80% payout share with
                  clear billing and no hidden programmatic deductions.
                </p>
              </Card>
            </div>
          </div>
        </section>

        {/* COMPREHENSIVE ENGLISH FAQ SECTION (SEO & LLMO ENHANCED) */}
        <section className="py-20 bg-white border-t border-slate-200">
          <div
            className="mx-auto"
            style={{
              maxWidth: 1000,
              paddingLeft: 'clamp(24px,5vw,72px)',
              paddingRight: 'clamp(24px,5vw,72px)',
            }}
          >
            <div className="text-center max-w-2xl mx-auto mb-12">
              <Eyebrow>Frequently Asked Questions</Eyebrow>
              <h2 className="m-0 text-3xl font-extrabold text-slate-900 tracking-tight sm:text-4xl mt-2">
                Everything You Need to Know About Birtingur
              </h2>
            </div>

            <div className="space-y-4">
              {ENGLISH_FAQS.map((faq, idx) => (
                <div
                  key={faq.q}
                  className="rounded-2xl border border-slate-200 bg-white overflow-hidden transition-all duration-200 shadow-sm"
                >
                  <button
                    onClick={() => setOpenFaq(openFaq === idx ? null : idx)}
                    className="w-full p-6 text-left font-bold text-slate-900 text-lg flex justify-between items-center gap-4 cursor-pointer hover:bg-slate-50"
                  >
                    <span>{faq.q}</span>
                    <span className="text-primary text-xl font-extrabold shrink-0">
                      {openFaq === idx ? '−' : '+'}
                    </span>
                  </button>
                  {openFaq === idx && (
                    <div className="px-6 pb-6 text-slate-600 text-sm leading-relaxed border-t border-slate-100 pt-4">
                      {faq.a}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </section>
      </main>

      {/* DEDICATED CLEAN ENGLISH FOOTER */}
      <footer className="border-t border-slate-200 bg-slate-900 text-white py-12 px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-6xl flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-3">
            <Logo className="h-7 w-auto text-white" />
            <span className="text-xs text-slate-400">
              — The Privacy-First Category Display Network
            </span>
          </div>

          <div className="text-xs text-slate-400 text-center md:text-right">
            © {new Date().getFullYear()} Birtingur. All rights reserved. 100% Cookie-Free.
          </div>
        </div>
      </footer>
    </div>
  );
}
