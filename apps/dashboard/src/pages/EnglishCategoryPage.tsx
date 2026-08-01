import { useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import EnglishHeader from '@/components/layout/EnglishHeader';
import EnglishFooter from '@/components/layout/EnglishFooter';
import { updateSEO } from '@/lib/seo';
import { Card } from '@/components/ui/Card';
import { Eyebrow } from '@/components/ui/editorial';
import { Button } from '@/components/ui/Button';
import { ARTICLES, renderRichText, JsonLd, type ArticleFaq } from './EnglishGuidePage';
import { ArrowRight } from 'lucide-react';

interface CategoryMeta {
  title: string;
  heroHeadline: string;
  description: string;
  creatorHook: string;
  brandHook: string;
  /** Rich-text sections (blank-line paragraphs, [text](url) links). */
  sections: { h2: string; p: string }[];
  faqs: ArticleFaq[];
  /** Slugs into ARTICLES, rendered as related-guide links. */
  relatedGuides: string[];
}

const CATEGORY_DETAILS: Record<string, CategoryMeta> = {
  food: {
    title: 'Food & Culinary Display Ad Network',
    heroHeadline: 'Connect Food Creators Directly with Culinary Brands',
    description:
      'Target high-intent recipe lovers, home cooks, and food enthusiasts across independent culinary blogs — 100% cookie-free with flat CPM pricing.',
    creatorHook:
      'Earn an 80% revenue share on your food blog without slowing down page load or placing ugly programmatic ad clutter.',
    brandHook:
      'Reach engaged foodies during meal prep and grocery planning with category-wide placement across independent food blogs.',
    sections: [
      {
        h2: 'Why Food Content Converts',
        p: 'Recipe and food content carries some of the strongest purchase intent on the open web: a reader comparing ingredient substitutions or browsing weeknight dinner ideas is hours — sometimes minutes — from a buying decision. The page itself is the targeting signal; no behavioral profile improves on it.\n\nFood is also where independent creators still dominate. Recipe blogs, baking specialists, and coffee obsessives hold reader trust that aggregators cannot match, and a brand placed in that environment borrows its coherence instead of interrupting it.',
      },
      {
        h2: 'How a Food Category Buy Works',
        p: 'One decision, not a media plan: choose the Food & Culinary category, set a budget, review the daily impression forecast shown in the buy flow, and launch. Impressions spread across every registered food site in the network at the flat 550 kr. CPM, counted only after the IAB viewability delay, with statistics updating hourly.\n\nFor creators, the deal is the network standard — 80% of net revenue, monthly bank-transfer payouts from 5.000 kr., one embed under 5KB, and zero cookies dropped on readers. The full playbook lives in our [Food & Culinary advertising guide](/en/guides/food-culinary-blog-advertising-guide).',
      },
    ],
    faqs: [
      {
        q: 'What does advertising in the food category cost?',
        a: 'A flat 550 kr. CPM — the same price as every category on the network. You set a total budget, and the buy flow shows a daily impression forecast for the category before you commit.',
      },
      {
        q: 'Which sites will my ads appear on?',
        a: 'Across all registered sites in the Food & Culinary category. You buy the category, not individual placements — that is what keeps the buy simple and the price flat.',
      },
      {
        q: 'What does a food blogger earn?',
        a: '80% of net ad revenue from viewable impressions on their pages, paid monthly by bank transfer from 5.000 kr., with hourly statistics in the dashboard.',
      },
    ],
    relatedGuides: [
      'food-culinary-blog-advertising-guide',
      'cookieless-advertising-2026',
      'adsense-alternatives-niche-blogs',
    ],
  },
  tech: {
    title: 'Tech & Innovation Category Ad Network',
    heroHeadline: 'Privacy-First Display Ads for Developers & Tech Blogs',
    description:
      'Reach software engineers, tech enthusiasts, and early adopters across indie technology sites without third-party tracking cookies or invasive surveillance.',
    creatorHook:
      'Monetize developer and tech publications with privacy-respecting, lightweight ad snippets.',
    brandHook:
      'Promote SaaS tools, developer APIs, and tech products directly to tech-savvy audiences.',
    sections: [
      {
        h2: 'The Hardest Audience to Reach Any Other Way',
        p: 'Developers and technical readers run blockers, decline consent, and inspect what a page ships — the exact audience tracking-based advertising fails to reach. Contextual placement on the tech blogs they actually read is one of the few channels that still works, because it depends on the page, not on surveillance.\n\nFor B2B SaaS, developer tooling, and fintech brands, that context is precise: a reader on an independent engineering blog is a professional evaluating tools, at a flat 550 kr. CPM with no premium-vertical markup.',
      },
      {
        h2: 'Built the Way Developers Would Build It',
        p: 'The integration is a single script under 5KB or a typed React component obtained over MCP — reserved dimensions, no layout shift, zero cookies, viewability-counted impressions. Tech publishers keep the Core Web Vitals their readers notice.\n\nThe whole platform is also operable by agents: campaign buying, slot provisioning, and stats all run over the [MCP server](/en/guides/mcp-ai-agent-advertising) with human-controlled guardrails. The publisher-side details are in our [tech & finance monetization guide](/en/guides/tech-finance-blog-monetization-guide).',
      },
    ],
    faqs: [
      {
        q: 'Can I integrate without touching a dashboard?',
        a: 'Almost — a human creates the API key in the dashboard once; from there, registration, slot creation, and the React component all run over MCP tools (register_publisher, create_slot, get_react_component).',
      },
      {
        q: 'Do tech placements cost advertisers more?',
        a: 'No. The 550 kr. CPM is flat across every category — the tech audience comes from the context, not from a price tier.',
      },
      {
        q: 'Will the embed hurt my site’s performance metrics?',
        a: 'It is designed not to: under 5KB, asynchronous, dimensions reserved before render, and no third-party tracking scripts riding along.',
      },
    ],
    relatedGuides: [
      'tech-finance-blog-monetization-guide',
      'mcp-ai-agent-advertising',
      'ai-app-monetization-sdk-widgets',
    ],
  },
  travel: {
    title: 'Travel & Outdoors Display Ad Network',
    heroHeadline: 'Contextual Display Ads for Travel Bloggers & Outdoor Brands',
    description:
      'Advertise directly to adventure seekers, vacation planners, and outdoor enthusiasts across independent travel publications.',
    creatorHook:
      'Turn your travel guides and destination reviews into predictable ad revenue with zero cookie banners required.',
    brandHook:
      'Place your travel gear, hotel, or booking platform in front of active trip planners.',
    sections: [
      {
        h2: 'Reach Readers While the Trip Is Still a Plan',
        p: 'Trip planning is one of the longest research journeys in consumer spending — weeks of destination guides, gear comparisons, and honest reviews from bloggers who paid their own way. A brand present during that research is present when the decisions get made: where to stay, what to book, what to pack.\n\nCategory placement puts tour operators, gear brands, and booking services alongside that content across every registered travel site at once, at the network-wide flat 550 kr. CPM.',
      },
      {
        h2: 'What Travel Creators Get',
        p: 'Independent travel bloggers earn 80% of net revenue from viewable impressions, paid monthly from 5.000 kr., with a single sub-5KB embed that sets zero cookies — no consent-wall between wanderlust and the content, and no traffic minimums that leave niche destination sites out.\n\nImpressions count only after the IAB viewability delay and statistics update hourly. The full brand-side playbook is our [Travel & Outdoors advertising guide](/en/guides/travel-outdoors-blog-advertising-guide).',
      },
    ],
    faqs: [
      {
        q: 'What kinds of brands fit the travel category?',
        a: 'Tour operators, booking platforms, airlines, hotels, luggage and outdoor gear brands, travel insurance — anything a reader planning a trip is about to spend money on.',
      },
      {
        q: 'Can I pick specific travel blogs?',
        a: 'No — the buy is category-wide across all registered Travel & Outdoors sites. You control the category, budget, and creative; the platform spreads the impressions.',
      },
      {
        q: 'Is there a premium price for travel inventory?',
        a: 'No. The flat 550 kr. CPM applies to every category equally, and the buy flow shows a daily impression forecast before you commit budget.',
      },
    ],
    relatedGuides: [
      'travel-outdoors-blog-advertising-guide',
      'flat-cpm-vs-programmatic-rtb',
      'adsense-alternatives-niche-blogs',
    ],
  },
  fashion: {
    title: 'Fashion & Beauty Category Display Network',
    heroHeadline: 'Connect Style Creators with Forward-Thinking Fashion Brands',
    description:
      'Monetize lifestyle and fashion blogs with clean, contextual display ads targeted strictly by audience interest.',
    creatorHook: 'Keep your aesthetic clean and premium while earning an 80% net revenue share.',
    brandHook:
      'Showcase apparel, cosmetics, and lifestyle brands to highly targeted style audiences.',
    sections: [
      {
        h2: 'Where Inspiration Becomes a Purchase',
        p: 'Style content collapses inspiration and shopping into a single moment: outfit ideas, skincare routines, and seasonal lookbooks are read by people actively assembling their next purchase. An apparel or cosmetics ad in that context is part of the experience rather than an interruption to it.\n\nAnd because style readers skew mobile and privacy-conscious, cookie-free contextual serving reaches the full audience — including everyone tracking-based systems lose to declined consent and blockers.',
      },
      {
        h2: 'Ads Clean Enough for a Styled Page',
        p: 'Fashion creators protect their aesthetic fiercely, and rightly — visual judgment is their product. Birtingur serves standard IAB formats in reserved containers that never shift a layout, with a content policy the creator controls and a fallback (house ad or transparent) when nothing eligible fills.\n\nCreators keep 80% of net revenue with monthly payouts from 5.000 kr.; brands get placements that inherit the page’s polish. Creative guidance and the full brand playbook are in our [Fashion & Beauty advertising guide](/en/guides/fashion-beauty-blog-advertising-guide).',
      },
    ],
    faqs: [
      {
        q: 'Can creators keep control over how ads look on their site?',
        a: 'Yes — placements are standard IAB formats in reserved containers (no layout shift), publishers set a content policy, and unfilled slots render a house ad or a transparent placeholder.',
      },
      {
        q: 'Which formats work best for fashion audiences?',
        a: 'Mobile-first: the 320×100 banner and 300×250 in-content rectangle carry most style reading; the 300×600 half page is the strongest desktop format for visual creative.',
      },
      {
        q: 'Do the ads track readers across sites?',
        a: 'No. Serving is cookie-free and contextual — no profiling, no cross-site identifiers, and only a consent-gated first-party value for frequency capping.',
      },
    ],
    relatedGuides: [
      'fashion-beauty-blog-advertising-guide',
      'mediavine-ezoic-alternatives-cookieless',
      'privacy-first-display-ads-gdpr',
    ],
  },
  finance: {
    title: 'Business & Finance Display Ad Network',
    heroHeadline: 'Contextual Advertising for Financial Media & Business Blogs',
    description:
      'Reach investors, entrepreneurs, and business decision-makers on verified finance blogs with zero third-party cookie tracking.',
    creatorHook:
      'Monetize business and personal finance content with transparent, flat-CPM ad revenue.',
    brandHook:
      'Target business software, fintech platforms, and professional services by audience category.',
    sections: [
      {
        h2: 'Decision-Maker Attention, Bought by Context',
        p: 'Business and finance readers are researching decisions their companies and portfolios will act on — software purchases, banking services, professional tools. Independent finance blogs hold that attention precisely because they are specialist and trusted, and contextual placement is how a brand joins the page without spending its credibility.\n\nFor B2B SaaS and fintech advertisers, the price is the same flat 550 kr. CPM as every category: no decision-maker surcharge, no auction premium, and a daily impression forecast visible before any budget is committed.',
      },
      {
        h2: 'Monetization That Respects a Trust Business',
        p: 'A site people consult about money cannot afford ad tech that tracks its readers. Birtingur’s serving sets zero cookies, builds no profiles, and adds one sub-5KB script — so finance publishers monetize without importing the surveillance their audience came to them to avoid.\n\nCreators keep 80% of net revenue with monthly payouts from 5.000 kr. and hourly statistics. The publisher-side detail is in our [tech & finance monetization guide](/en/guides/tech-finance-blog-monetization-guide), and the pricing model in [Flat CPM vs. Programmatic Auctions](/en/guides/flat-cpm-vs-programmatic-rtb).',
      },
    ],
    faqs: [
      {
        q: 'Is finance inventory priced at a premium?',
        a: 'No — the 550 kr. CPM is flat across all categories. The value of the finance context comes with the category, not with a higher price.',
      },
      {
        q: 'What advertiser types fit this category?',
        a: 'B2B SaaS, fintech platforms, banking and payment services, accounting tools, and professional services — brands whose buyers read business and finance content while deciding.',
      },
      {
        q: 'How is this compatible with a finance site’s trust obligations?',
        a: 'Serving is cookie-free with no reader profiling and no cross-site tracking; the only identifier is a consent-gated first-party frequency-capping value. See our [GDPR and display ads guide](/en/guides/privacy-first-display-ads-gdpr).',
      },
    ],
    relatedGuides: [
      'tech-finance-blog-monetization-guide',
      'flat-cpm-vs-programmatic-rtb',
      'geo-generative-engine-optimization-display-ads',
    ],
  },
};

export default function EnglishCategoryPage() {
  const { slug } = useParams<{ slug: string }>();

  const cat = slug ? CATEGORY_DETAILS[slug] : null;

  useEffect(() => {
    if (cat && slug) {
      updateSEO(
        `${cat.title} — Birtingur Privacy Ad Network`,
        cat.description,
        `/en/categories/${slug}`,
      );
      window.scrollTo({ top: 0 });
    }
  }, [cat, slug]);

  if (!cat) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col justify-between font-sans">
        <EnglishHeader />
        <main className="grow flex items-center justify-center py-20 px-4">
          <div className="text-center max-w-md">
            <h1 className="text-2xl font-bold text-slate-900 mb-4">Category Not Found</h1>
            <p className="text-sm text-slate-600 mb-6">
              The requested content category is not currently active in our English taxonomy.
            </p>
            <Link to="/en">
              <Button variant="primary">← Back to English Overview</Button>
            </Link>
          </div>
        </main>
        <EnglishFooter />
      </div>
    );
  }

  const faqSchema = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: cat.faqs.map((f) => ({
      '@type': 'Question',
      name: f.q,
      acceptedAnswer: {
        '@type': 'Answer',
        text: f.a.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1'),
      },
    })),
  };

  const related = cat.relatedGuides
    .map((s) => ARTICLES[s])
    .filter((a): a is NonNullable<typeof a> => Boolean(a));

  return (
    <div className="flex min-h-screen flex-col bg-white font-sans text-slate-900 antialiased selection:bg-primary selection:text-white">
      <EnglishHeader />
      <JsonLd data={faqSchema} />

      <main className="grow">
        <section
          style={{ paddingTop: 'clamp(56px,7vw,96px)', paddingBottom: 'clamp(48px,6vw,72px)' }}
        >
          <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
            <Eyebrow className="mb-3">Category Display Network</Eyebrow>
            <h1 className="m-0 text-3xl sm:text-5xl font-extrabold text-slate-900 tracking-tight leading-tight">
              {cat.heroHeadline}
            </h1>
            <p className="mt-6 text-lg sm:text-xl text-slate-600 leading-relaxed max-w-3xl">
              {cat.description}
            </p>

            <div className="mt-12 grid grid-cols-1 md:grid-cols-2 gap-8">
              <Card className="p-8 bg-slate-50 border border-slate-200 rounded-2xl">
                <span className="text-xs font-bold text-primary uppercase tracking-wider block mb-2">
                  For Creators & Bloggers
                </span>
                <h3 className="text-xl font-bold text-slate-900 mb-3">Monetize Your Audience</h3>
                <p className="text-sm text-slate-600 leading-relaxed">{cat.creatorHook}</p>
                <div className="mt-6 pt-6 border-t border-slate-200 flex items-center justify-between text-xs font-bold text-slate-700">
                  <span>80% Net Payout</span>
                  <span>Zero Third-Party Cookies</span>
                </div>
              </Card>

              <Card className="p-8 bg-slate-50 border border-slate-200 rounded-2xl">
                <span className="text-xs font-bold text-primary uppercase tracking-wider block mb-2">
                  For Brands & Advertisers
                </span>
                <h3 className="text-xl font-bold text-slate-900 mb-3">Category-Wide Reach</h3>
                <p className="text-sm text-slate-600 leading-relaxed">{cat.brandHook}</p>
                <div className="mt-6 pt-6 border-t border-slate-200 flex items-center justify-between text-xs font-bold text-slate-700">
                  <span>Flat CPM Pricing</span>
                  <span>Direct Contextual Placement</span>
                </div>
              </Card>
            </div>

            {/* Category deep-dive sections */}
            <div className="mt-16 max-w-3xl space-y-10">
              {cat.sections.map((sec) => (
                <div key={sec.h2} className="space-y-3">
                  <h2 className="text-2xl font-black text-slate-900">{sec.h2}</h2>
                  {renderRichText(sec.p, sec.h2, 'text-base text-slate-650 leading-relaxed')}
                </div>
              ))}
            </div>

            {/* FAQ */}
            <div className="mt-16 max-w-3xl">
              <h2 className="text-2xl font-black text-slate-900 mb-6">
                Frequently Asked Questions
              </h2>
              <div className="space-y-4">
                {cat.faqs.map((f) => (
                  <div key={f.q} className="bg-slate-50 rounded-2xl border border-slate-200 p-6">
                    <h3 className="text-base font-bold text-slate-900 mb-2">{f.q}</h3>
                    {renderRichText(f.a, f.q, 'text-sm text-slate-650 leading-relaxed')}
                  </div>
                ))}
              </div>
            </div>

            {/* Related guides */}
            {related.length > 0 && (
              <div className="mt-16">
                <h2 className="text-xl font-black text-slate-900 mb-6">Guides for This Category</h2>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  {related.map((a) => (
                    <Link
                      key={a.slug}
                      to={`/en/guides/${a.slug}`}
                      className="group bg-white rounded-2xl border border-slate-200/80 hover:border-primary/40 hover:shadow-lg transition p-5 flex flex-col"
                    >
                      <span className="text-[11px] font-bold text-slate-400 mb-2">
                        {a.category}
                      </span>
                      <span className="text-sm font-bold text-slate-900 group-hover:text-primary transition-colors leading-snug line-clamp-3">
                        {a.title}
                      </span>
                      <span className="inline-flex items-center gap-1 text-xs font-bold text-primary mt-auto pt-3">
                        Read Guide
                        <ArrowRight className="w-3 h-3 group-hover:translate-x-0.5 transition-transform" />
                      </span>
                    </Link>
                  ))}
                </div>
              </div>
            )}

            <div className="mt-14 text-center">
              <Link to="/en#waitlist-section">
                <Button
                  variant="primary"
                  className="py-3.5 px-8 text-base font-bold shadow-lg shadow-primary/20"
                >
                  Join the {cat.title} Waitlist →
                </Button>
              </Link>
            </div>
          </div>
        </section>
      </main>

      <EnglishFooter />
    </div>
  );
}
