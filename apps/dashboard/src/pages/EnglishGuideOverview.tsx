import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import PublicHeader from '@/components/layout/PublicHeader';
import PublicFooter from '@/components/layout/PublicFooter';
import { updateSEO } from '@/lib/seo';
import { ARTICLES, type ArticleMeta } from './EnglishGuidePage';
import { Clock, ArrowRight, Search, Sparkles } from 'lucide-react';

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
    window.scrollTo({ top: 0 });
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
    <div className="min-h-screen bg-slate-50 text-slate-800 flex flex-col font-sans antialiased overflow-x-hidden selection:bg-blue-600 selection:text-white">
      {/* Background Ambient Gradients */}
      <div className="absolute top-0 left-1/4 w-150 h-150 rounded-full bg-blue-500/5 blur-[120px] pointer-events-none -z-10" />
      <div className="absolute top-1/3 right-10 w-125 h-125 rounded-full bg-indigo-500/5 blur-[100px] pointer-events-none -z-10" />

      <PublicHeader />

      <main className="grow pt-24 pb-20">
        {/* Hero Section */}
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 pt-12 pb-12 text-center">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-indigo-50 border border-indigo-100 text-indigo-700 text-xs font-bold mb-6">
            <Sparkles className="w-3.5 h-3.5" />
            <span>Developer & Creator Resources</span>
          </div>
          <h1 className="text-4xl sm:text-5xl font-black text-slate-900 tracking-tight mb-4">
            Privacy-First Ads &{' '}
            <span className="bg-linear-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">
              AI Infrastructure Guides
            </span>
          </h1>
          <p className="max-w-2xl mx-auto text-base sm:text-lg text-slate-600 leading-relaxed font-medium">
            Comprehensive playbooks on Model Context Protocol (MCP) ad buying, Generative Engine
            Optimization (GEO), cookieless category targeting, and GDPR compliance.
          </p>
        </div>

        {/* Filters & Search */}
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 mb-10">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 pb-6">
            <div className="flex flex-wrap gap-2">
              {CATEGORIES.map((cat) => (
                <button
                  key={cat}
                  onClick={() => setSelectedCategory(cat)}
                  className={`px-4 py-2 rounded-xl text-xs font-bold transition cursor-pointer ${
                    selectedCategory === cat
                      ? 'bg-blue-600 text-white shadow-sm'
                      : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>

            <div className="relative w-full md:w-72">
              <Search className="w-4 h-4 absolute left-3.5 top-3 text-slate-400" />
              <input
                type="text"
                placeholder="Search guides..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2 rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/50 text-sm font-medium text-slate-900"
              />
            </div>
          </div>
        </div>

        {/* Articles Grid */}
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          {filteredArticles.length === 0 ? (
            <div className="text-center py-16 bg-white rounded-2xl border border-slate-200">
              <Search className="w-8 h-8 text-slate-300 mx-auto mb-3" />
              <h3 className="text-lg font-bold text-slate-900">No guides found</h3>
              <p className="text-sm text-slate-500 mt-1 mb-4">
                Try adjusting your search query or topic category filter.
              </p>
              <button
                onClick={() => {
                  setSelectedCategory('All');
                  setSearchQuery('');
                }}
                className="px-4 py-2 bg-slate-100 text-slate-700 text-xs font-bold rounded-xl hover:bg-slate-200 transition"
              >
                Reset Filters
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
              {filteredArticles.map((art) => (
                <article
                  key={art.slug}
                  className="group bg-white rounded-2xl border border-slate-200/80 hover:border-blue-300 hover:shadow-xl hover:shadow-blue-500/5 transition-all duration-300 flex flex-col h-full overflow-hidden"
                >
                  <div className="p-6 flex flex-col grow">
                    {/* Category & Read Time */}
                    <div className="flex items-center justify-between gap-4 mb-4 text-xs font-semibold text-slate-400">
                      <span className="bg-slate-100 text-slate-650 px-2.5 py-1 rounded-lg">
                        {art.category}
                      </span>
                      <div className="flex items-center gap-1.5">
                        <Clock className="w-3.5 h-3.5" />
                        <span>{art.readTime}</span>
                      </div>
                    </div>

                    {/* Title & Desc */}
                    <h3 className="text-lg font-bold text-slate-900 mb-2 group-hover:text-blue-600 transition-colors duration-200 line-clamp-2">
                      <Link to={`/en/guides/${art.slug}`}>{art.title}</Link>
                    </h3>
                    <p className="text-slate-500 text-sm leading-relaxed mb-6 grow line-clamp-3">
                      {art.description}
                    </p>

                    {/* Read Link */}
                    <div className="pt-4 border-t border-slate-100 mt-auto flex items-center justify-between">
                      <span className="text-xs text-slate-400 font-medium">{art.date}</span>
                      <Link
                        to={`/en/guides/${art.slug}`}
                        className="inline-flex items-center gap-1.5 text-xs font-bold text-blue-600 hover:text-blue-700 transition"
                      >
                        Read Guide
                        <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
                      </Link>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}

          {/* Call To Action Box */}
          <div className="mt-16 bg-linear-to-br from-blue-600 to-indigo-650 text-white rounded-2xl p-8 sm:p-10 shadow-xl shadow-blue-500/10 text-center relative overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 bg-white/5 rounded-full blur-2xl pointer-events-none" />
            <h2 className="text-2xl sm:text-3xl font-black mb-3">
              Build & Advertise with Privacy-First Display Ads
            </h2>
            <p className="text-white/80 text-sm max-w-lg mx-auto mb-6 leading-relaxed">
              Whether you are an AI agent developer building app monetization or a brand targeting
              niche content categories, reserve your spot today.
            </p>
            <Link
              to="/en#waitlist-section"
              className="inline-flex items-center gap-2 bg-white text-blue-700 px-6 py-3 rounded-xl text-xs font-black hover:bg-slate-50 transition shadow-sm"
            >
              Join Global Early Access Waitlist
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </main>

      <PublicFooter />
    </div>
  );
}
