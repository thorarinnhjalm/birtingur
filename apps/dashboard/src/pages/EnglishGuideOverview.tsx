import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { updateSEO } from '@/lib/seo';
import { Card } from '@/components/ui/Card';
import { Eyebrow, PillButton } from '@/components/ui/editorial';
import { Button } from '@/components/ui/Button';
import { ARTICLES, type ArticleMeta } from './EnglishGuidePage';
import Logo from '@/components/ui/Logo';

const CATEGORIES = [
  'All',
  'AI & MCP',
  'Creator Monetization',
  'Privacy & Compliance',
  'Category Playbooks',
] as const;

export default function EnglishGuideOverview() {
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    updateSEO(
      'Educational Guides & Resources — Birtingur Privacy Display Network',
      'Explore comprehensive educational guides on Model Context Protocol (MCP) ad buying, Generative Engine Optimization (GEO), cookieless category advertising, and GDPR monetization.',
      '/en/guides',
    );
  }, []);

  const articlesList: ArticleMeta[] = Object.values(ARTICLES);

  const filteredArticles = articlesList.filter((art) => {
    const matchesCategory = selectedCategory === 'All' || art.category === selectedCategory;
    const matchesSearch =
      searchQuery === '' ||
      art.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      art.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
      art.category.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  return (
    <div className="min-h-screen bg-white text-slate-900 font-sans antialiased flex flex-col justify-between">
      <div>
        {/* HEADER */}
        <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/90 backdrop-blur-md">
          <div className="mx-auto flex h-20 max-w-6xl items-center justify-between px-4 sm:px-6 lg:px-8">
            <div className="flex items-center gap-3">
              <Link to="/en" className="flex items-center gap-2 text-slate-900 no-underline">
                <Logo className="h-8 w-auto text-primary" />
              </Link>
              <span className="text-slate-300 font-light">/</span>
              <span className="text-slate-600 text-sm font-bold">Guides Catalog</span>
            </div>

            <div className="flex items-center gap-4">
              <Link
                to="/en"
                className="text-xs font-bold text-slate-600 hover:text-primary hidden sm:inline"
              >
                Landing Page
              </Link>
              <Link to="/en#waitlist-section">
                <Button variant="primary" className="text-xs font-bold py-2.5 px-4">
                  Join Waitlist →
                </Button>
              </Link>
            </div>
          </div>
        </header>

        <main className="py-16 px-4 sm:px-6 lg:px-8 max-w-6xl mx-auto">
          {/* HERO HEADER */}
          <div className="max-w-3xl mb-12">
            <Eyebrow className="mb-3">Resource Center & Guide Catalog</Eyebrow>
            <h1 className="text-4xl sm:text-5xl font-extrabold text-slate-900 tracking-tight leading-tight m-0">
              Privacy-First Display Ads & AI Infrastructure Guides
            </h1>
            <p className="mt-4 text-lg text-slate-600 leading-relaxed font-medium">
              Comprehensive playbooks on Model Context Protocol (MCP) ad buying, Generative Engine
              Optimization (GEO), cookieless category targeting, and GDPR compliance.
            </p>
          </div>

          {/* FILTERS & SEARCH */}
          <div className="mb-10 flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 pb-8">
            <div className="flex flex-wrap gap-2">
              {CATEGORIES.map((cat) => (
                <PillButton
                  key={cat}
                  active={selectedCategory === cat}
                  onClick={() => setSelectedCategory(cat)}
                >
                  {cat}
                </PillButton>
              ))}
            </div>

            <div className="w-full md:w-72">
              <input
                type="text"
                placeholder="Search guides..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full px-4 py-2.5 rounded-full border border-slate-300 focus:outline-none focus:ring-2 focus:ring-primary/50 text-sm font-medium text-slate-900"
              />
            </div>
          </div>

          {/* ARTICLES GRID */}
          {filteredArticles.length === 0 ? (
            <div className="text-center py-16 bg-slate-50 rounded-2xl border border-slate-200">
              <span className="text-3xl mb-2 block">🔍</span>
              <h3 className="text-lg font-bold text-slate-900">No guides found</h3>
              <p className="text-sm text-slate-500 mt-1">
                Try adjusting your search query or topic category filter.
              </p>
              <Button
                variant="secondary"
                className="mt-4 text-xs font-bold"
                onClick={() => {
                  setSelectedCategory('All');
                  setSearchQuery('');
                }}
              >
                Reset Filters
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
              {filteredArticles.map((art) => (
                <Link key={art.slug} to={`/en/guides/${art.slug}`} className="no-underline group">
                  <Card className="p-7 bg-white hover:bg-slate-50/80 border border-slate-200 rounded-2xl transition-all duration-200 hover:shadow-lg group-hover:border-primary/50 h-full flex flex-col justify-between">
                    <div>
                      <div className="flex items-center justify-between gap-2 mb-3">
                        <span className="rounded-full bg-slate-100 px-3 py-0.5 text-[10px] font-bold uppercase tracking-wider text-slate-600 border border-slate-200">
                          {art.category}
                        </span>
                        <span className="text-[11px] font-medium text-slate-400">
                          {art.readTime}
                        </span>
                      </div>

                      <h3 className="text-xl font-bold text-slate-900 group-hover:text-primary transition-colors mb-3 leading-snug">
                        {art.title}
                      </h3>

                      <p className="text-sm text-slate-600 leading-relaxed line-clamp-3">
                        {art.description}
                      </p>
                    </div>

                    <div className="mt-6 pt-4 border-t border-slate-200/80 flex items-center justify-between text-xs font-bold text-primary">
                      <span>Read Guide</span>
                      <span className="group-hover:translate-x-1 transition-transform">→</span>
                    </div>
                  </Card>
                </Link>
              ))}
            </div>
          )}

          {/* WAITLIST CALLOUT CARD */}
          <Card className="mt-20 p-8 md:p-12 bg-slate-900 text-white rounded-3xl text-center max-w-3xl mx-auto shadow-2xl">
            <span className="inline-block rounded-full bg-primary/20 text-primary-300 px-3 py-1 text-xs font-bold uppercase tracking-wider mb-4">
              Early Access Waitlist
            </span>
            <h2 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight m-0">
              Build & Advertise with Privacy-First Display Ads
            </h2>
            <p className="mt-3 text-slate-300 text-sm max-w-lg mx-auto leading-relaxed">
              Whether you are an AI agent developer building app monetization or a brand targeting
              niche content categories, reserve your spot today.
            </p>
            <Link to="/en#waitlist-section">
              <Button
                variant="primary"
                className="mt-6 py-3.5 px-8 text-sm font-bold shadow-lg shadow-primary/30"
              >
                Join Global Early Access Waitlist →
              </Button>
            </Link>
          </Card>
        </main>
      </div>

      {/* FOOTER */}
      <footer className="border-t border-slate-200 bg-slate-900 py-12 px-4 sm:px-6 lg:px-8 text-white mt-20">
        <div className="mx-auto max-w-6xl flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-3">
            <Logo className="h-7 w-auto text-white" />
            <span className="text-xs text-slate-400">
              — The Privacy-First Category Display Network
            </span>
          </div>

          <div className="text-xs text-slate-400 text-center md:text-right">
            © {new Date().getFullYear()} Birtingur. All rights reserved. 100% Cookie-Free & MCP
            Ready.
          </div>
        </div>
      </footer>
    </div>
  );
}
