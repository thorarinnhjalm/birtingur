import { useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { updateSEO } from '@/lib/seo';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';

export interface ArticleMeta {
  slug: string;
  title: string;
  subtitle: string;
  description: string;
  date: string;
  readTime: string;
  category: 'AI & MCP' | 'Creator Monetization' | 'Privacy & Compliance' | 'Category Playbooks';
  sections: { h2: string; p: string }[];
}

export const ARTICLES: Record<string, ArticleMeta> = {
  'cookieless-advertising-2026': {
    slug: 'cookieless-advertising-2026',
    category: 'Privacy & Compliance',
    title: 'Cookieless Advertising in 2026: Why Category Networks Outperform Tracking Cookies',
    subtitle:
      'As third-party tracking cookies vanish and privacy regulations tighten, contextual category display networks are proving to be both more profitable for creators and more effective for brands.',
    description:
      'Learn why cookieless contextual category advertising is replacing invasive third-party tracking cookies for creators and brands in 2026.',
    date: 'August 2026',
    readTime: '4 min read',
    sections: [
      {
        h2: 'The End of Third-Party Cookie Tracking',
        p: 'For over two decades, digital advertising relied on dropping third-party tracking cookies across reader browsers. This created intrusive user surveillance, heavy page load penalties, and increasingly complex cookie consent banners that frustrated website visitors.',
      },
      {
        h2: 'Why Contextual Category Buying Wins',
        p: 'Instead of following a user across the web with creepy retargeting banners, category buying matches ads strictly to content context. A visitor reading a food recipe is in an active culinary mindset — placing a food brand ad on that page delivers high relevance without sacrificing user privacy.',
      },
      {
        h2: 'How Birtingur Reinvents Display Ads',
        p: 'Birtingur provides a 100% cookie-free category display network where independent creators earn an 80% revenue share with flat CPM pricing. Zero tracking cookies, zero site slowdowns, and total transparency.',
      },
    ],
  },
  'adsense-alternatives-niche-blogs': {
    slug: 'adsense-alternatives-niche-blogs',
    category: 'Creator Monetization',
    title: 'The Creator Guide to Monetizing Niche Blogs Without Cookie Banners',
    subtitle:
      'Discover how independent bloggers and content creators are earning predictable ad revenue without annoying readers with intrusive tracking scripts or complex CMP banners.',
    description:
      'A complete creator guide to blog monetization alternatives without Google AdSense or cookie tracking.',
    date: 'August 2026',
    readTime: '5 min read',
    sections: [
      {
        h2: 'The Problem With Traditional Ad Networks',
        p: 'Legacy ad platforms often burden small-to-medium bloggers with low CPM rates, heavy tracking scripts that degrade site performance, and strict traffic minimums for independent blogs.',
      },
      {
        h2: 'Transparent Revenue Sharing',
        p: 'Creators deserve transparency. Birtingur operates with an 80% net payout model — creators keep 80% of ad revenue in their category with dashboard analytics updated hourly.',
      },
      {
        h2: 'Lightweight & Privacy-First Integration',
        p: 'Embedding Birtingur is a single copy-paste: add one size-budgeted script snippet to your site. No third-party cookies dropped on your readers and no page slowdowns.',
      },
    ],
  },
  'mcp-ai-agent-advertising': {
    slug: 'mcp-ai-agent-advertising',
    category: 'AI & MCP',
    title: 'The Developer & Agent Guide to MCP-Native Display Advertising',
    subtitle:
      'Model Context Protocol (MCP) enables autonomous AI agents to buy campaigns and app developers to provision ad placements programmatically.',
    description:
      'Discover how AI agents and developers leverage Birtingur MCP tools (create_campaign, register_publisher, get_react_component) to manage ads natively.',
    date: 'August 2026',
    readTime: '6 min read',
    sections: [
      {
        h2: 'Why Model Context Protocol (MCP) Changes Display Ads',
        p: 'Traditional ad platforms require humans to click through complex dashboards or manage fragile OAuth REST APIs. Birtingur provides a native MCP server (mcp.birtingur.app) allowing LLMs and AI agents (like Claude and custom agentic pipelines) to inspect categories, set spending guardrails, and launch campaigns autonomously.',
      },
      {
        h2: 'For Advertisers: Programmatic AI Agent Purchasing',
        p: 'Using tools like `list_categories` and `create_campaign`, an AI agent can evaluate campaign objectives, pick relevant content verticals (e.g., Tech & Innovation), enforce budget caps, and deploy ad creatives directly. Integrated safety limits (autoApproveLimitIsk) ensure high-value campaigns await human verification before funds unlock.',
      },
      {
        h2: 'For Developers: Ad Infrastructure Provisioning',
        p: 'Developers building web apps or AI tools can call `register_publisher`, `create_slot`, and `get_react_component` via MCP. In seconds, their application receives fully typed React components ready to render privacy-first contextual display ads and start earning revenue.',
      },
    ],
  },
  'geo-generative-engine-optimization-display-ads': {
    slug: 'geo-generative-engine-optimization-display-ads',
    category: 'AI & MCP',
    title: 'Generative Engine Optimization (GEO): How AI Search Engines Recommend Brands in 2026',
    subtitle:
      'AI search engines like Perplexity, SearchGPT, and Claude recommend products based on contextual category presence rather than legacy keyword spam.',
    description:
      'Master Generative Engine Optimization (GEO) and learn how contextual category display placements drive AI search recommendations.',
    date: 'August 2026',
    readTime: '5 min read',
    sections: [
      {
        h2: 'From SEO to GEO: The Shift to AI Answer Engines',
        p: 'As millions of users replace traditional Google search bars with AI answer engines like Perplexity, SearchGPT, and Gemini, traditional SEO keyword stuffing is losing effectiveness. AI engines synthesize recommendations by analyzing brand mentions across authoritative niche publisher categories.',
      },
      {
        h2: 'How Contextual Category Visibility Powers GEO',
        p: 'When your brand is consistently displayed across top food, tech, or lifestyle blogs within a specific category, AI crawlers associate your brand with high contextual topical authority. Category-wide ad coverage establishes persistent brand signals that feed directly into LLM retrieval-augmented generation (RAG) pipelines.',
      },
      {
        h2: 'Building a Future-Proof GEO Display Strategy',
        p: 'By pairing privacy-first flat CPM display ads with clean, cookie-free publisher partnerships, brands secure high-visibility category placements that capture human reader attention while building machine-readable brand presence across generative AI engines.',
      },
    ],
  },
  'ai-app-monetization-sdk-widgets': {
    slug: 'ai-app-monetization-sdk-widgets',
    category: 'AI & MCP',
    title: 'Monetizing AI Web Apps & Chat Interfaces with Privacy-First Display Widgets',
    subtitle:
      'How Next.js developers and AI wrapper builders can integrate lightweight, non-intrusive display ad widgets to monetize AI tools.',
    description:
      'A practical guide for AI app developers to monetize chatbots, SaaS tools, and web applications using privacy-first ad widgets.',
    date: 'August 2026',
    readTime: '4 min read',
    sections: [
      {
        h2: 'The Challenge of Monetizing Modern AI Web Apps',
        p: 'Building AI applications powered by LLM APIs incurs ongoing token costs. Traditional programmatic ad networks drop heavy tracking scripts and intrusive popups that break modern React/Next.js single-page applications and destroy user experience.',
      },
      {
        h2: 'Lightweight & Privacy-First Widget Architecture',
        p: 'Birtingur provides size-budgeted JavaScript snippets and native React components designed specifically for web applications. Ad placements load asynchronously in zero-CLS containers without dropping cookies or tracking user chat prompts.',
      },
      {
        h2: 'Monetize Web Applications Cleanly',
        p: 'Developers can register their app, define interest categories matching their user base, and drop a `<BirtingurAdSlot />` component directly into their layout. Revenue accrues hourly with 80% net payouts directly to the developer’s wallet.',
      },
    ],
  },
  'mediavine-ezoic-alternatives-cookieless': {
    slug: 'mediavine-ezoic-alternatives-cookieless',
    category: 'Creator Monetization',
    title: 'Why Independent Creators Choose Category Networks over Mediavine & Ezoic',
    subtitle:
      'A side-by-side analysis of traditional ad management networks versus modern, lightweight category display networks.',
    description:
      'Compare Mediavine, Ezoic, and Birtingur: discover why independent bloggers prefer 80% revenue share with zero tracking cookies and fast page speeds.',
    date: 'August 2026',
    readTime: '6 min read',
    sections: [
      {
        h2: 'The Hidden Cost of Traditional Ad Management Networks',
        p: 'For years, networks like Mediavine and Ezoic required bloggers to install heavy ad wrappers that load dozens of third-party tracking scripts. These wrappers cause severe layout shifts, slow down mobile page loads, and mandate minimum traffic thresholds for independent blogs.',
      },
      {
        h2: 'Fast Page Speeds & High Viewability',
        p: 'Birtingur eliminates middleman ad tech bloat. Our single-script implementation weighs less than 5KB, preserves Google Core Web Vitals, and counts viewable impressions only after the IAB viewability threshold is met.',
      },
      {
        h2: 'Fair 80% Payouts Without Arbitrary Traffic Gates',
        p: 'Birtingur believes every quality content creator deserves fair monetization. Creators keep 80% of net ad revenue with monthly payouts (minimum 5,000 kr.) and zero arbitrary traffic rejection gates.',
      },
    ],
  },
  'flat-cpm-vs-programmatic-rtb': {
    slug: 'flat-cpm-vs-programmatic-rtb',
    category: 'Creator Monetization',
    title: 'Flat CPM vs. Programmatic Auctions: Why Category Network Pricing Beats Bidding Wars',
    subtitle:
      'Understand how flat CPM category buying eliminates programmatic ad tax, auction volatility, and opaque middleman fees.',
    description:
      'Learn why flat CPM category ad pricing provides predictable revenues for creators and transparent ROI for brands compared to bidding auctions.',
    date: 'August 2026',
    readTime: '5 min read',
    sections: [
      {
        h2: 'The Opaque World of Programmatic Auctions',
        p: 'In traditional programmatic auctions, up to 50% of an advertiser’s budget is eaten up by DSPs, SSPs, data brokers, and verification vendors. Creators receive fluctuating CPMs, while advertisers pay inflated rates for low-quality ad placements.',
      },
      {
        h2: 'The Power of Predictable Flat CPM Pricing',
        p: 'Birtingur operates on a simple, transparent flat 550 kr. CPM across all categories. Advertisers know exactly what every impression costs, and creators receive a predictable 80% payout split without unpredictable auction crashes.',
      },
      {
        h2: 'Direct Category Efficiency',
        p: 'By cutting out complex bidding auctions and third-party data brokers, Birtingur delivers direct category-to-creator placements that maximize ROI for brands while funding independent web creators fairly.',
      },
    ],
  },
  'privacy-first-display-ads-gdpr': {
    slug: 'privacy-first-display-ads-gdpr',
    category: 'Privacy & Compliance',
    title: 'The Complete GDPR & ePrivacy Guide to Website Monetization Without Consent Banners',
    subtitle:
      'How to monetize digital content legally in Europe without annoying visitors with intrusive CMP cookie consent banners.',
    description:
      'An educational legal and technical guide to GDPR & ePrivacy compliance in display advertising through cookieless contextual targeting.',
    date: 'August 2026',
    readTime: '6 min read',
    sections: [
      {
        h2: 'The Frustration of CMP Cookie Consent Banners',
        p: 'European ePrivacy regulations and GDPR require explicit user consent before storing or accessing tracking cookies on a visitor’s device. Consent Management Platforms (CMPs) degrade user experience, leading to high bounce rates and lost ad revenue when users decline cookies.',
      },
      {
        h2: 'Privacy-by-Design Display Architecture',
        p: 'Birtingur serves ads entirely in-context based on interest category matching. Our ad serving mechanism sets zero tracking cookies, drops no cross-site beacons, and performs no reader profiling. Because no personal data is tracked or shared across domains, websites avoid complex consent banner requirements for ad serving.',
      },
      {
        h2: 'Retaining Reader Trust & Regulatory Compliance',
        p: 'Publishers and brands can operate with full peace of mind. By prioritizing privacy by design, your website stays fully compliant with European data privacy laws while providing a clean, respectful experience for every reader.',
      },
    ],
  },
  'food-culinary-blog-advertising-guide': {
    slug: 'food-culinary-blog-advertising-guide',
    category: 'Category Playbooks',
    title: 'Food & Culinary Display Advertising: Reaching Home Cooks in High-Intent Mindsets',
    subtitle:
      'How kitchen brands, food delivery services, and culinary sites capture high-converting recipe audiences.',
    description:
      'A deep dive into food and culinary category ad buying: how brands connect with home cooks during meal planning.',
    date: 'August 2026',
    readTime: '5 min read',
    sections: [
      {
        h2: 'The Power of Culinary Mindset Targeting',
        p: 'Food and recipe content drives some of the highest purchase intent on the internet. A reader browsing dinner recipes, ingredient substitutions, or kitchen appliance reviews is actively preparing to spend money on food and kitchen products.',
      },
      {
        h2: 'Contextual Category vs. Generic Retargeting',
        p: 'Showing a footwear ad on a baking blog confuses the reader. Placed within Birtingur’s Food & Culinary category, your ad appears directly alongside trusted recipe creators, maximizing brand recall and click-through relevance.',
      },
      {
        h2: 'Empowering Food Creators',
        p: 'Food bloggers spend hours testing recipes, photographing dishes, and writing detailed guides. Birtingur’s 80% revenue share ensures food creators receive fair compensation to keep publishing quality culinary content.',
      },
    ],
  },
  'tech-finance-blog-monetization-guide': {
    slug: 'tech-finance-blog-monetization-guide',
    category: 'Category Playbooks',
    title: 'Monetization for Tech & Finance Blogs: Direct Category Placements',
    subtitle:
      'Maximizing ad revenue for business, fintech, and developer blogs with high-value category advertisers.',
    description:
      'Discover how tech and business publishers monetize decision-maker audiences with flat-CPM category placements.',
    date: 'August 2026',
    readTime: '5 min read',
    sections: [
      {
        h2: 'Reaching Decision Makers in Tech & Business',
        p: 'Tech, SaaS, and financial blogs attract high-value audiences of software developers, business founders, and financial decision makers. These readers demand clean, professional site design without intrusive popups or spammy ad networks.',
      },
      {
        h2: 'Flat-CPM Value for Tech Advertisers',
        p: 'B2B SaaS companies and financial institutions want targeted reach without paying astronomical programmatic DSP markups. Birtingur’s Tech & Innovation and Business & Finance categories deliver direct placement across verified niche blogs.',
      },
      {
        h2: 'Clean, Fast & Professional Ad Experience',
        p: 'With lightweight, size-budgeted script snippets and zero third-party tracking, tech and finance blogs preserve their elite performance metrics while generating consistent monthly ad revenue.',
      },
    ],
  },
};

export default function EnglishGuidePage() {
  const { slug } = useParams<{ slug: string }>();
  const article = slug ? ARTICLES[slug] : null;

  useEffect(() => {
    if (article && slug) {
      updateSEO(article.title, article.description, `/en/guides/${slug}`);

      const schemaData = {
        '@context': 'https://schema.org',
        '@type': 'Article',
        headline: article.title,
        description: article.description,
        datePublished: '2026-08-01',
        author: {
          '@type': 'Organization',
          name: 'Birtingur Network',
          url: 'https://www.birtingur.app/en',
        },
        publisher: {
          '@type': 'Organization',
          name: 'Birtingur',
          url: 'https://www.birtingur.app/en',
        },
        mainEntityOfPage: {
          '@type': 'WebPage',
          '@id': `https://www.birtingur.app/en/guides/${slug}`,
        },
      };

      let script = document.getElementById('jsonld-english-guide');
      if (!script) {
        script = document.createElement('script');
        script.id = 'jsonld-english-guide';
        script.setAttribute('type', 'application/ld+json');
        document.head.appendChild(script);
      }
      script.textContent = JSON.stringify(schemaData);

      return () => {
        if (script && script.parentNode) {
          script.parentNode.removeChild(script);
        }
      };
    }
  }, [article, slug]);

  if (!article) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="text-center max-w-md">
          <h1 className="text-2xl font-bold text-slate-900 mb-4">Guide Not Found</h1>
          <p className="text-slate-600 mb-6 text-sm">
            The guide article you are looking for does not exist or has been moved.
          </p>
          <Link to="/en/guides">
            <Button variant="primary">← Browse All Guides</Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white text-slate-900 font-sans antialiased flex flex-col justify-between">
      <div>
        <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/90 backdrop-blur-md">
          <div className="mx-auto flex h-20 max-w-4xl items-center justify-between px-4 sm:px-6">
            <Link
              to="/en/guides"
              className="text-lg font-extrabold text-slate-900 no-underline flex items-center gap-2"
            >
              <span className="text-primary font-black">Birtingur</span>
              <span className="text-slate-300 font-light">/</span>
              <span className="text-slate-600 text-sm font-bold">Guides</span>
            </Link>
            <div className="flex items-center gap-3">
              <Link
                to="/en/guides"
                className="text-xs font-bold text-slate-600 hover:text-primary hidden sm:inline"
              >
                All Guides
              </Link>
              <Link to="/en#waitlist-section">
                <Button variant="primary" className="text-xs font-bold py-2 px-3.5">
                  Join Waitlist →
                </Button>
              </Link>
            </div>
          </div>
        </header>

        <main className="py-16 px-4 sm:px-6 max-w-3xl mx-auto">
          <div className="flex items-center gap-2 mb-4">
            <Link to="/en/guides" className="text-xs font-bold text-primary hover:underline">
              ← Guides Catalog
            </Link>
            <span className="text-slate-300">•</span>
            <span className="rounded-full bg-slate-100 px-3 py-1 text-[11px] font-bold text-slate-700 border border-slate-200">
              {article.category}
            </span>
          </div>

          <h1 className="text-3xl sm:text-4xl font-extrabold text-slate-900 tracking-tight leading-tight">
            {article.title}
          </h1>
          <p className="mt-4 text-lg text-slate-600 leading-relaxed font-medium">
            {article.subtitle}
          </p>

          <div className="mt-8 border-y border-slate-200 py-4 flex items-center justify-between text-xs font-bold text-slate-400 uppercase tracking-wider">
            <span>
              Published {article.date} • {article.readTime}
            </span>
            <span>100% Cookie-Free</span>
          </div>

          <div className="mt-10 space-y-10">
            {article.sections.map((sec) => (
              <div key={sec.h2} className="prose prose-slate max-w-none">
                <h2 className="text-2xl font-bold text-slate-900 tracking-tight mb-3">{sec.h2}</h2>
                <p className="text-slate-600 leading-relaxed text-base">{sec.p}</p>
              </div>
            ))}
          </div>

          <Card className="mt-14 p-8 bg-slate-50 border border-slate-200 rounded-2xl text-center shadow-sm">
            <span className="text-3xl mb-2 block">🚀</span>
            <h3 className="text-xl font-bold text-slate-900 mb-2">
              Ready for Privacy-First Display Ads?
            </h3>
            <p className="text-sm text-slate-600 max-w-md mx-auto mb-6">
              Join creators and brands testing Birtingur’s cookie-free category display network.
            </p>
            <Link to="/en#waitlist-section">
              <Button
                variant="primary"
                className="py-3.5 px-6 text-sm font-bold shadow-md shadow-primary/20"
              >
                Join Early Access Waitlist →
              </Button>
            </Link>
          </Card>

          <div className="mt-10 pt-8 border-t border-slate-200 flex justify-between items-center text-xs font-bold text-primary">
            <Link to="/en/guides" className="hover:underline">
              ← Back to All Guides
            </Link>
            <Link to="/en" className="hover:underline">
              Visit English Landing Page →
            </Link>
          </div>
        </main>
      </div>

      <footer className="border-t border-slate-200 bg-slate-900 py-10 px-4 text-center text-xs text-slate-400">
        © {new Date().getFullYear()} Birtingur. All rights reserved. 100% Cookie-Free & Privacy
        First.
      </footer>
    </div>
  );
}
