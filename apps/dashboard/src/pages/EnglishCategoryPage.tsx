import { useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import EnglishHeader from '@/components/layout/EnglishHeader';
import EnglishFooter from '@/components/layout/EnglishFooter';
import { updateSEO } from '@/lib/seo';
import { Card } from '@/components/ui/Card';
import { Eyebrow } from '@/components/ui/editorial';
import { Button } from '@/components/ui/Button';

interface CategoryMeta {
  title: string;
  heroHeadline: string;
  description: string;
  creatorHook: string;
  brandHook: string;
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
  },
  fashion: {
    title: 'Fashion & Beauty Category Display Network',
    heroHeadline: 'Connect Style Creators with Forward-Thinking Fashion Brands',
    description:
      'Monetize lifestyle and fashion blogs with clean, contextual display ads targeted strictly by audience interest.',
    creatorHook: 'Keep your aesthetic clean and premium while earning an 80% net revenue share.',
    brandHook:
      'Showcase apparel, cosmetics, and lifestyle brands to highly targeted style audiences.',
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

  return (
    <div className="flex min-h-screen flex-col bg-white font-sans text-slate-900 antialiased selection:bg-primary selection:text-white">
      <EnglishHeader />

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
