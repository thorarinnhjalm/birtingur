import { useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import EnglishHeader from '@/components/layout/EnglishHeader';
import EnglishFooter from '@/components/layout/EnglishFooter';
import { updateSEO } from '@/lib/seo';
import { Clock, ArrowLeft, ArrowRight, Share2 } from 'lucide-react';

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
    title: 'Cookieless Advertising in 2026: How Category Networks Replace Tracking Cookies',
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
        p: 'With a publisher API key created in the Birtingur dashboard, developers building web apps or AI tools can call `register_publisher`, `create_slot`, and `get_react_component` via MCP. Their application receives a fully typed React component ready to render privacy-first contextual display ads, with revenue shared 80/20 and paid out monthly.',
      },
    ],
  },
  'geo-generative-engine-optimization-display-ads': {
    slug: 'geo-generative-engine-optimization-display-ads',
    category: 'AI & MCP',
    title: 'Generative Engine Optimization (GEO): How AI Search Engines Recommend Brands in 2026',
    subtitle:
      'As readers shift from traditional search to AI answer engines like Perplexity, ChatGPT Search, and Claude, brands are rethinking visibility — here is what category display ads can and cannot do for GEO.',
    description:
      'An honest look at Generative Engine Optimization (GEO) and where contextual category display placements may fit into AI search visibility.',
    date: 'August 2026',
    readTime: '5 min read',
    sections: [
      {
        h2: 'From SEO to GEO: The Shift to AI Answer Engines',
        p: 'As millions of users replace traditional Google search bars with AI answer engines like Perplexity, ChatGPT Search, and Gemini, traditional SEO keyword stuffing is losing effectiveness. These engines synthesize answers from authoritative web content — which has brands asking how discovery works when a chatbot answers first.',
      },
      {
        h2: 'What Category Visibility May — and May Not — Do for GEO',
        p: 'Could consistent brand presence across top food, tech, or lifestyle blogs influence how AI engines discover and describe your brand? Nobody can honestly promise that today: display ads render in the reader’s browser, and AI crawlers mostly do not see them. What category coverage verifiably builds is brand recall among the human readers those engines cite — any GEO upside on top of that is an emerging hypothesis, not a proven mechanism.',
      },
      {
        h2: 'Building a Future-Proof GEO Display Strategy',
        p: 'By pairing privacy-first flat CPM display ads with clean, cookie-free publisher partnerships, brands secure high-visibility category placements that capture human reader attention. Buy category placements for the readers planning purchases today — and treat any generative-engine upside as a possible bonus, not the business case.',
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
        p: 'Developers can register their app, define interest categories matching their user base, and drop a `<BirtingurAdSlot />` component directly into their layout. Revenue accrues automatically with an 80% net share, paid out monthly (minimum 5,000 kr.) by bank transfer.',
      },
    ],
  },
  'mediavine-ezoic-alternatives-cookieless': {
    slug: 'mediavine-ezoic-alternatives-cookieless',
    category: 'Creator Monetization',
    title:
      'Mediavine & Ezoic Alternatives: How Cookieless Category Networks Compare for Independent Creators',
    subtitle:
      'A side-by-side analysis of traditional ad management networks versus modern, lightweight category display networks.',
    description:
      'Compare Mediavine, Ezoic, and Birtingur: an 80% revenue share model with zero tracking cookies and a single lightweight embed.',
    date: 'August 2026',
    readTime: '6 min read',
    sections: [
      {
        h2: 'The Hidden Cost of Traditional Ad Management Networks',
        p: 'Traditional ad management networks typically ask bloggers to install heavy ad wrappers loaded with third-party tracking scripts — a common cause of layout shifts and slow mobile page loads. Networks like Mediavine and Ezoic also publicly document minimum traffic requirements that leave many independent blogs out.',
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
    title:
      'Flat CPM vs. Programmatic Auctions: How Category Network Pricing Differs from Auction Bidding',
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
    title: 'GDPR, ePrivacy and Display Ads: How Cookieless Category Serving Simplifies Compliance',
    subtitle:
      'An educational guide to how cookieless, category-based ad serving interacts with GDPR and ePrivacy rules for European creators.',
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
        p: 'Birtingur serves ads entirely in-context based on interest category matching. The ad serving mechanism sets zero tracking cookies, drops no cross-site beacons, and performs no reader profiling — even the first-party frequency-capping identifier is consent-gated. Because the ad layer tracks no personal data across domains, it adds far less consent overhead than cookie-based networks; each publisher remains responsible for their own site-wide compliance.',
      },
      {
        h2: 'Retaining Reader Trust & Regulatory Compliance',
        p: 'Privacy by design keeps the ad stack from adding tracking risk to your site while providing a clean, respectful experience for every reader. This guide is educational — it is not legal advice for your specific site.',
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

  const handleShare = () => {
    if (navigator.share && article) {
      navigator
        .share({
          title: article.title,
          text: article.description,
          url: window.location.href,
        })
        .catch(() => {});
    } else {
      navigator.clipboard.writeText(window.location.href);
      alert('Link copied to clipboard!');
    }
  };

  if (!article) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="text-center max-w-md">
          <h1 className="text-2xl font-bold text-slate-900 mb-4">Guide Not Found</h1>
          <p className="text-slate-600 mb-6 text-sm">
            The guide article you are looking for does not exist or has been moved.
          </p>
          <Link
            to="/en/guides"
            className="inline-flex items-center gap-2 bg-primary text-white px-5 py-2.5 rounded-xl text-xs font-bold hover:bg-primary-800 transition"
          >
            <ArrowLeft className="w-4 h-4" />
            Browse All Guides
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 flex flex-col font-sans antialiased overflow-x-hidden selection:bg-primary selection:text-white">
      <EnglishHeader />

      <main className="grow pt-28 pb-20">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* Back Link */}
          <Link
            to="/en/guides"
            className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-500 hover:text-slate-800 transition mb-8 group"
          >
            <ArrowLeft className="w-3.5 h-3.5 group-hover:-translate-x-0.5 transition-transform" />
            Back to Guides Catalog
          </Link>

          {/* Article Header */}
          <header className="mb-10">
            <div className="flex items-center justify-between gap-4 mb-4 text-xs font-semibold text-slate-400">
              <span className="bg-slate-100 text-slate-650 px-2.5 py-1 rounded-lg">
                {article.category}
              </span>
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5" />
                  <span>{article.readTime}</span>
                </div>
                <span>•</span>
                <span>{article.date}</span>
              </div>
            </div>
            <h1 className="text-3xl sm:text-4xl font-extrabold text-slate-900 tracking-tight leading-tight mb-6">
              {article.title}
            </h1>
            <p className="text-lg text-slate-650 font-medium leading-relaxed border-l-4 border-primary pl-4 py-1 mb-8">
              {article.subtitle}
            </p>
          </header>

          {/* Article Sections */}
          <div className="prose prose-slate max-w-none text-slate-700 leading-relaxed space-y-6">
            {article.sections.map((sec) => (
              <div key={sec.h2} className="space-y-3">
                <h2 className="text-2xl font-black text-slate-900 pt-4 pb-1">{sec.h2}</h2>
                <p className="text-base sm:text-[17px] text-slate-650 leading-relaxed">{sec.p}</p>
              </div>
            ))}
          </div>

          {/* Share Action */}
          <div className="flex items-center justify-between pt-8 border-t border-slate-200 mt-12 mb-16">
            <button
              onClick={handleShare}
              className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-500 hover:text-slate-800 transition cursor-pointer bg-transparent border-0 p-0"
            >
              <Share2 className="w-3.5 h-3.5" />
              Share Article
            </button>
          </div>

          {/* Call To Action Box */}
          <div className="bg-primary text-white rounded-2xl p-8 sm:p-10 shadow-xl shadow-primary/10 text-center relative overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 bg-white/5 rounded-full blur-2xl pointer-events-none" />
            <h3 className="text-2xl font-black mb-3">Ready for Privacy-First Display Ads?</h3>
            <p className="text-white/80 text-sm max-w-lg mx-auto mb-6 leading-relaxed">
              Join creators and brands testing Birtingur’s cookie-free category display network.
            </p>
            <Link
              to="/en#waitlist-section"
              className="inline-flex items-center gap-2 bg-white text-primary px-6 py-3 rounded-xl text-xs font-black hover:bg-slate-50 transition shadow-sm"
            >
              Join Early Access Waitlist
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </main>

      <EnglishFooter />
    </div>
  );
}
