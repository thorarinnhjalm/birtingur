import { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Check, ArrowRight, Sparkles, Lock } from 'lucide-react';
import { updateSEO } from '@/lib/seo';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Eyebrow, BigFigure, PillButton } from '@/components/ui/editorial';
import EnglishHeader from '@/components/layout/EnglishHeader';
import EnglishFooter from '@/components/layout/EnglishFooter';
import type { WaitlistRole } from '@ada/shared/types';
import { AD_CATEGORIES } from '@ada/shared';

const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:3001';

const ENGLISH_CATEGORY_INFO: Record<string, { label: string; routeSlug: string }> = {
  matur: { label: 'Food & Culinary', routeSlug: 'food' },
  ferdalog: { label: 'Travel & Outdoors', routeSlug: 'travel' },
  tiska_fegurd: { label: 'Fashion & Beauty', routeSlug: 'fashion' },
  taekni: { label: 'Tech & Innovation', routeSlug: 'tech' },
  heilsa_likamsraekt: { label: 'Health & Fitness', routeSlug: 'health' },
  fjarmal_vidskipti: { label: 'Business & Finance', routeSlug: 'finance' },
  ithrottir: { label: 'Sports & Athletics', routeSlug: 'sports' },
  born_foreldrar: { label: 'Parenting & Family', routeSlug: 'family' },
  bilar: { label: 'Automotive & Transport', routeSlug: 'auto' },
  heimili_honnun: { label: 'Home & Interior Design', routeSlug: 'home' },
  afthreying_menning: { label: 'Entertainment & Culture', routeSlug: 'culture' },
  dyr_gaeludyr: { label: 'Pets & Animals', routeSlug: 'pets' },
};

const ENGLISH_CATEGORIES_LIST = AD_CATEGORIES.map((c) => {
  const info = ENGLISH_CATEGORY_INFO[c.slug];
  return {
    slug: c.slug,
    label: info ? info.label : c.label.split(' & ')[0],
    routeSlug: info ? info.routeSlug : 'food',
  };
});

const FEATURED_GUIDES = [
  {
    slug: 'mcp-ai-agent-advertising',
    category: 'AI & MCP',
    title: 'The Developer & Agent Guide to MCP-Native Display Advertising',
    desc: 'How AI agents buy campaigns and app developers provision ad placements programmatically via Model Context Protocol (MCP).',
    readTime: '6 min read',
  },
  {
    slug: 'geo-generative-engine-optimization-display-ads',
    category: 'AI & MCP',
    title: 'Generative Engine Optimization (GEO): How AI Search Engines Recommend Brands',
    desc: 'How Perplexity, SearchGPT, and Claude synthesize category brand mentions into top search recommendations.',
    readTime: '5 min read',
  },
  {
    slug: 'mediavine-ezoic-alternatives-cookieless',
    category: 'Creator Monetization',
    title:
      'Mediavine & Ezoic Alternatives: How Cookieless Category Networks Compare for Independent Creators',
    desc: 'Discover why creators prefer 80% revenue share with zero tracking cookies and fast page load speeds.',
    readTime: '6 min read',
  },
  {
    slug: 'privacy-first-display-ads-gdpr',
    category: 'Privacy & Compliance',
    title: 'GDPR, ePrivacy and Display Ads: How Cookieless Category Serving Simplifies Compliance',
    desc: 'How cookieless, category-based ad serving interacts with GDPR and ePrivacy rules for European creators.',
    readTime: '6 min read',
  },
];

const ENGLISH_FAQS = [
  {
    q: 'How does Birtingur operate 100% cookie-free?',
    a: 'Unlike legacy programmatic networks that drop third-party tracking cookies across reader browsers, Birtingur serves ads entirely in-context based on interest categories. Frequency capping uses first-party consent-gated tokens stored strictly in the publisher’s origin. No user profiling, no cross-site tracking.',
  },
  {
    q: 'How do AI agents and developers use the MCP server?',
    a: 'Birtingur hosts an MCP server (mcp.birtingur.app). AI agents use tools like `list_categories` and `create_campaign` to buy context ads autonomously with spending caps. App developers use tools like `register_publisher`, `create_slot`, and `get_react_component` to provision display ad slots programmatically.',
  },
  {
    q: 'How do digital creators and bloggers earn money?',
    a: 'Creators embed a single lightweight, size-budgeted script snippet on their site. Whenever ads serve in their declared content categories, creators receive 80% of net advertising revenue with transparent dashboard reporting updated hourly.',
  },
  {
    q: 'What makes Category Network Buying better than traditional ad buying?',
    a: 'Traditional programmatic ad buying is bogged down by middleman tax, auction bidding wars, and intrusive tracker scripts that slow down websites. Birtingur lets brands buy an entire interest category (e.g. Food & Culinary) with a single campaign budget at a transparent flat CPM price.',
  },
  {
    q: 'How does Birtingur approach GDPR and ePrivacy?',
    a: 'Birtingur is built privacy-first by design: no third-party cookies, no tracking beacons, no user profiling, and a consent-gated first-party frequency cap. That design keeps the ad layer from adding tracking obligations to your site — each publisher remains responsible for their own overall compliance.',
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
  const { hash } = useLocation();

  // React Router does not scroll to #anchors on cross-route navigation, so
  // /en#waitlist-section links from the shared English header/guide pages
  // land at the top without this.
  useEffect(() => {
    if (!hash) return;
    document.getElementById(hash.slice(1))?.scrollIntoView({ behavior: 'smooth' });
  }, [hash]);

  useEffect(() => {
    updateSEO(
      'Birtingur — MCP-Native & Cookie-Free Category Display Ad Network',
      'Birtingur is the privacy-first, MCP-native category display ad network connecting creators, brands, and AI agents directly by interest category. Join the global waitlist.',
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
          description:
            'MCP-native and privacy-first category display ad network for creators, brands, and AI agents.',
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
          MCP & AI Agent Native
        </span>
        <span>
          Birtingur is expanding its MCP-native & privacy-first ad network globally.{' '}
          <a
            href="#waitlist-section"
            className="inline-flex items-center gap-1 font-bold text-primary underline hover:text-primary-800"
          >
            <span>Join the early access waitlist</span>
            <ArrowRight className="h-3.5 w-3.5" />
          </a>
        </span>
      </div>

      {/* HEADER */}
      <EnglishHeader />

      <main className="grow">
        {/* HERO SECTION */}
        <section className="py-16 md:py-24 px-4 sm:px-6 lg:px-8 max-w-5xl mx-auto text-left">
          <div className="inline-flex items-center gap-2 rounded-full bg-slate-100 border border-slate-200 px-3 py-1 text-xs font-bold text-slate-700 mb-6">
            <Sparkles className="h-3.5 w-3.5 text-primary" />
            <span>MCP-Native & Cookie-Free Display Ad Network</span>
          </div>

          <h1
            className="m-0 font-extrabold text-slate-900 tracking-tight"
            style={{
              fontSize: 'clamp(40px,6vw,84px)',
              lineHeight: 1.02,
              textWrap: 'balance',
            }}
          >
            Advertise by interest, <br className="hidden sm:inline" />
            not by tracking cookies
          </h1>

          <p className="mt-6 text-lg sm:text-xl text-slate-600 leading-relaxed max-w-3xl">
            Birtingur connects niche digital creators, AI app builders, and forward-thinking brands
            directly by interest category. Powered by native Model Context Protocol (MCP) tools for
            autonomous AI campaign management.
          </p>

          {/* ACTIVE CONTENT CATEGORIES */}
          <div className="mt-10">
            <span className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-3">
              Explore Active Content Categories (Click to view category details)
            </span>
            <div className="flex flex-wrap gap-2.5">
              {ENGLISH_CATEGORIES_LIST.map((c) => (
                <Link
                  key={c.slug}
                  to={`/en/categories/${c.routeSlug}`}
                  className="group rounded-full bg-slate-100 px-4 py-2 text-xs font-semibold text-slate-700 border border-slate-200 hover:border-primary hover:bg-primary/5 hover:text-primary transition-all duration-150 inline-flex items-center gap-1.5"
                >
                  <span>{c.label}</span>
                  <ArrowRight className="h-3 w-3 text-slate-400 group-hover:text-primary transition-transform group-hover:translate-x-0.5" />
                </Link>
              ))}
            </div>
          </div>

          {/* KEY STATS ROW */}
          <div className="mt-12 grid grid-cols-2 sm:grid-cols-3 gap-8 border-t border-slate-200 pt-8 max-w-2xl">
            <div>
              <BigFigure value="80%" suffix="Revenue Share" />
              <p className="mt-2 text-xs font-medium text-slate-500">
                Transparent creator payout share
              </p>
            </div>
            <div>
              <BigFigure value="100%" suffix="Cookie-Free" />
              <p className="mt-2 text-xs font-medium text-slate-500">
                Zero tracking cookies or cross-site profiling
              </p>
            </div>
          </div>
        </section>

        {/* MCP INFRASTRUCTURE SECTION */}
        <section className="py-20 border-t border-slate-200">
          <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center max-w-2xl mx-auto mb-14">
              <Eyebrow>Model Context Protocol</Eyebrow>
              <h2 className="text-3xl sm:text-4xl font-extrabold text-slate-900 tracking-tight mt-3 mb-4">
                Two Sides, One MCP Server
              </h2>
              <p className="text-slate-600 text-base leading-relaxed">
                A single endpoint at{' '}
                <code className="text-primary font-mono text-xs bg-slate-100 px-1.5 py-0.5 rounded">
                  mcp.birtingur.app
                </code>{' '}
                serves both buying agents and publishing developers with typed, auditable tool
                calls.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* ADVERTISER / AGENT SIDE */}
              <Card className="p-8 bg-slate-50 border border-slate-200 rounded-2xl">
                <span className="font-mono text-xs font-bold text-slate-400">01</span>
                <p className="text-xs font-bold uppercase tracking-wider text-primary mt-4 mb-1">
                  Advertiser Tools
                </p>
                <h3 className="text-xl font-bold text-slate-900 mb-3">
                  Autonomous Campaign Buying
                </h3>
                <p className="text-sm text-slate-600 leading-relaxed mb-5">
                  AI agents evaluate categories, set spending caps, and deploy display campaigns
                  through typed MCP tool calls — scoped to an API key you create and control in the
                  dashboard.
                </p>
                <ul className="space-y-2.5 text-xs text-slate-600 p-0 m-0 list-none mb-6">
                  <li className="flex items-start gap-2">
                    <Check className="h-3.5 w-3.5 text-primary mt-0.5 shrink-0" />
                    <span>Category selection and campaign deployment</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <Check className="h-3.5 w-3.5 text-primary mt-0.5 shrink-0" />
                    <span>Enforced spending caps per API key</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <Check className="h-3.5 w-3.5 text-primary mt-0.5 shrink-0" />
                    <span>Hourly wallet and campaign telemetry</span>
                  </li>
                </ul>
                <Link
                  to="/en/guides/mcp-ai-agent-advertising"
                  className="group inline-flex items-center gap-1.5 text-xs font-bold text-primary hover:text-primary-800 no-underline"
                >
                  Read the Agent Buying Guide
                  <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
                </Link>
              </Card>

              {/* PUBLISHER / DEVELOPER SIDE */}
              <Card className="p-8 bg-slate-50 border border-slate-200 rounded-2xl">
                <span className="font-mono text-xs font-bold text-slate-400">02</span>
                <p className="text-xs font-bold uppercase tracking-wider text-primary mt-4 mb-1">
                  Publisher Tools
                </p>
                <h3 className="text-xl font-bold text-slate-900 mb-3">Developer Ad Integration</h3>
                <p className="text-sm text-slate-600 leading-relaxed mb-5">
                  Register a site, create ad slots, and fetch ready-to-render React components or a
                  5 KB script snippet — all via MCP tool calls.
                </p>
                <ul className="space-y-2.5 text-xs text-slate-600 p-0 m-0 list-none mb-6">
                  <li className="flex items-start gap-2">
                    <Check className="h-3.5 w-3.5 text-primary mt-0.5 shrink-0" />
                    <span>Automated registration and slot creation</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <Check className="h-3.5 w-3.5 text-primary mt-0.5 shrink-0" />
                    <span>Typed React components and script snippets</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <Check className="h-3.5 w-3.5 text-primary mt-0.5 shrink-0" />
                    <span>80 % net revenue split, paid monthly</span>
                  </li>
                </ul>
                <Link
                  to="/en/guides/ai-app-monetization-sdk-widgets"
                  className="group inline-flex items-center gap-1.5 text-xs font-bold text-indigo-600 hover:text-indigo-800 no-underline"
                >
                  Read the Developer Guide
                  <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
                </Link>
              </Card>
            </div>
          </div>
        </section>

        {/* DEDICATED WAITLIST SECTION */}
        <section className="py-20 bg-slate-950 text-white" id="waitlist-section">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center max-w-2xl mx-auto mb-10">
              <span className="inline-block rounded-full bg-primary/20 text-primary-300 px-3 py-1 text-xs font-bold uppercase tracking-wider mb-3">
                Early Access Registration
              </span>
              <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-white m-0">
                Reserve Your Early Access Spot
              </h2>
              <p className="mt-3 text-slate-300 text-base">
                Join creators, app builders, and brands testing Birtingur in international markets.
              </p>
            </div>

            <Card className="p-6 md:p-10 bg-white text-slate-900 shadow-2xl rounded-2xl border border-slate-200 max-w-2xl mx-auto">
              <div className="mb-6">
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">
                  I am joining as a
                </label>
                <div className="flex flex-wrap gap-2">
                  <PillButton active={role === 'advertiser'} onClick={() => setRole('advertiser')}>
                    Brand / Advertiser
                  </PillButton>
                  <PillButton active={role === 'publisher'} onClick={() => setRole('publisher')}>
                    Creator / Developer
                  </PillButton>
                  <PillButton active={role === 'both'} onClick={() => setRole('both')}>
                    Both
                  </PillButton>
                </div>
              </div>

              {status === 'success' ? (
                <div className="p-6 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-center">
                  <div className="w-12 h-12 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto mb-3">
                    <Sparkles className="h-6 w-6" />
                  </div>
                  <p className="font-extrabold text-xl">{message}</p>
                  <p className="text-sm mt-2 text-emerald-700 leading-relaxed">
                    Your spot is reserved! We will reach out as soon as early access expands to your
                    content category.
                  </p>
                  <Button
                    variant="secondary"
                    className="mt-6 text-xs font-bold"
                    onClick={() => setStatus('idle')}
                  >
                    Register Another Email
                  </Button>
                </div>
              ) : (
                <form onSubmit={handleSubmit} className="space-y-5">
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
                      className="w-full px-4 py-3.5 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-primary/50 text-slate-900 text-sm font-medium"
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label
                        className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5"
                        htmlFor="waitlist-website"
                      >
                        Website / App URL
                      </label>
                      <input
                        id="waitlist-website"
                        type="url"
                        placeholder="https://myapp.com"
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
                    <p className="text-xs text-rose-600 font-bold">{message}</p>
                  )}

                  <Button
                    type="submit"
                    variant="primary"
                    disabled={status === 'submitting'}
                    className="w-full py-4 text-base font-bold shadow-xl shadow-primary/30 mt-2"
                  >
                    {status === 'submitting' ? (
                      'Joining Waitlist...'
                    ) : (
                      <span className="flex items-center justify-center gap-2">
                        <span>Join Early Access Waitlist</span>
                        <ArrowRight className="h-4 w-4" />
                      </span>
                    )}
                  </Button>

                  <p className="flex items-center justify-center gap-1.5 text-xs text-center text-slate-400 mt-3">
                    <Lock className="h-3.5 w-3.5 text-slate-400" />
                    <span>Privacy first. Zero tracking cookies. MCP & API Ready.</span>
                  </p>
                </form>
              )}
            </Card>
          </div>
        </section>

        {/* 3-STEP HOW IT WORKS */}
        <section className="py-20 bg-slate-50 border-t border-slate-200">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
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
                  Brands and AI agents pick target categories (Food, Tech, Travel). Ads
                  automatically serve across verified creator sites in that vertical.
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
                  Creators paste a 5KB script snippet or React component on their blog or web app.
                  Zero third-party cookies or performance penalties.
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
                  Dashboard analytics updated hourly. Creators receive an 80% payout share with
                  clear billing and no hidden programmatic deductions.
                </p>
              </Card>
            </div>
          </div>
        </section>

        {/* FEATURED GUIDES & ARTICLES SECTION */}
        <section className="py-20 bg-white border-t border-slate-200" id="guides-section">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex flex-col sm:flex-row sm:items-end justify-between mb-12 gap-4">
              <div>
                <Eyebrow className="mb-2">Educational Guides & Playbooks</Eyebrow>
                <h2 className="m-0 text-3xl font-extrabold text-slate-900 tracking-tight sm:text-4xl">
                  Explore Privacy-First Ad Playbooks
                </h2>
              </div>
              <Link to="/en/guides">
                <Button variant="secondary" className="text-xs font-bold">
                  <span className="flex items-center gap-1.5">
                    <span>Browse All 10 Guides</span>
                    <ArrowRight className="h-3.5 w-3.5" />
                  </span>
                </Button>
              </Link>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              {FEATURED_GUIDES.map((g) => (
                <Link key={g.slug} to={`/en/guides/${g.slug}`} className="no-underline group">
                  <Card className="p-8 bg-slate-50 hover:bg-white border border-slate-200 rounded-2xl transition-all duration-200 hover:shadow-lg group-hover:border-primary/50 h-full flex flex-col justify-between">
                    <div>
                      <div className="flex items-center justify-between gap-2 mb-3">
                        <span className="text-xs font-bold uppercase tracking-wider text-primary">
                          {g.category}
                        </span>
                        <span className="text-xs text-slate-400 font-medium">{g.readTime}</span>
                      </div>
                      <h3 className="text-xl font-bold text-slate-900 group-hover:text-primary transition-colors mb-3 leading-snug">
                        {g.title}
                      </h3>
                      <p className="text-sm text-slate-600 leading-relaxed">{g.desc}</p>
                    </div>
                    <div className="mt-6 pt-4 border-t border-slate-200/80 flex items-center justify-between text-xs font-bold text-primary">
                      <span>Read Guide</span>
                      <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                    </div>
                  </Card>
                </Link>
              ))}
            </div>

            <div className="mt-12 text-center">
              <Link to="/en/guides">
                <Button variant="primary" className="py-3 px-6 text-xs font-bold">
                  <span className="flex items-center gap-2">
                    <span>View Complete 10-Guide Catalog</span>
                    <ArrowRight className="h-4 w-4" />
                  </span>
                </Button>
              </Link>
            </div>
          </div>
        </section>

        {/* COMPREHENSIVE FAQ SECTION */}
        <section className="py-20 bg-slate-50 border-t border-slate-200">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
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

      {/* FOOTER */}
      <EnglishFooter />
    </div>
  );
}
