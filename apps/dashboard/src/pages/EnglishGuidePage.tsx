import { useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { updateSEO } from '@/lib/seo';
import { Card } from '@/components/ui/Card';
import { Eyebrow } from '@/components/ui/editorial';
import { Button } from '@/components/ui/Button';

interface ArticleMeta {
  title: string;
  subtitle: string;
  description: string;
  date: string;
  readTime: string;
  sections: { h2: string; p: string }[];
}

const ARTICLES: Record<string, ArticleMeta> = {
  'cookieless-advertising-2026': {
    title: 'Cookieless Advertising in 2026: Why Category Networks Outperform Tracking Cookies',
    subtitle:
      'As third-party tracking cookies vanish and privacy regulations tighten, contextual category display networks are proving to be both more profitable for creators and more effective for brands.',
    description:
      'Learn why cookieless contextual category advertising is replacing invasive third-party tracking cookies for creators and brands in 2026.',
    date: 'July 2026',
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
    title: 'The Creator Guide to Monetizing Niche Blogs Without Cookie Banners',
    subtitle:
      'Discover how independent bloggers and content creators are earning predictable ad revenue without annoying readers with intrusive tracking scripts or complex CMP banners.',
    description:
      'A complete creator guide to blog monetization alternatives without Google AdSense or cookie tracking.',
    date: 'July 2026',
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
        p: 'Embedding Birtingur takes less than 2 minutes: paste a single size-budgeted script snippet into your site. No third-party cookies dropped on your readers and no page slowdowns.',
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
    }
  }, [article, slug]);

  if (!article) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="text-center max-w-md">
          <h1 className="text-2xl font-bold text-slate-900 mb-4">Guide Not Found</h1>
          <Link to="/en">
            <Button variant="primary">← Back to Overview</Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white text-slate-900 font-sans antialiased">
      <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/90 backdrop-blur-md">
        <div className="mx-auto flex h-20 max-w-4xl items-center justify-between px-4 sm:px-6">
          <Link to="/en" className="text-lg font-extrabold text-slate-900 no-underline">
            <span className="text-primary">Birtingur</span>{' '}
            <span className="text-slate-400 font-normal">/ Guides</span>
          </Link>
          <Link to="/en#waitlist-form">
            <Button variant="primary" className="text-xs font-bold py-2 px-3">
              Join Waitlist →
            </Button>
          </Link>
        </div>
      </header>

      <main className="py-16 px-4 sm:px-6 max-w-3xl mx-auto">
        <Eyebrow className="mb-3">Educational Guide • {article.readTime}</Eyebrow>
        <h1 className="text-3xl sm:text-4xl font-extrabold text-slate-900 tracking-tight leading-tight">
          {article.title}
        </h1>
        <p className="mt-4 text-lg text-slate-600 leading-relaxed font-medium">
          {article.subtitle}
        </p>

        <div className="mt-8 border-y border-slate-200 py-4 flex items-center justify-between text-xs font-bold text-slate-400 uppercase tracking-wider">
          <span>Published {article.date}</span>
          <span>100% Cookie-Free</span>
        </div>

        <div className="mt-10 space-y-10">
          {article.sections.map((sec) => (
            <div key={sec.h2}>
              <h2 className="text-2xl font-bold text-slate-900 tracking-tight mb-3">{sec.h2}</h2>
              <p className="text-slate-600 leading-relaxed text-base">{sec.p}</p>
            </div>
          ))}
        </div>

        <Card className="mt-14 p-8 bg-slate-50 border border-slate-200 rounded-2xl text-center">
          <h3 className="text-xl font-bold text-slate-900 mb-2">
            Ready for Privacy-First Display Ads?
          </h3>
          <p className="text-sm text-slate-600 max-w-md mx-auto mb-6">
            Join the waitlist for early access to Birtingur’s cookie-free category display network.
          </p>
          <Link to="/en#waitlist-form">
            <Button variant="primary" className="py-3 px-6 text-sm font-bold">
              Join Early Access Waitlist →
            </Button>
          </Link>
        </Card>
      </main>

      <footer className="border-t border-slate-200 bg-slate-900 py-10 px-4 text-center text-xs text-slate-400">
        © {new Date().getFullYear()} Birtingur. All rights reserved. 100% Cookie-Free.
      </footer>
    </div>
  );
}
