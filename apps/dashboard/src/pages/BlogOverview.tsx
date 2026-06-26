import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import PublicHeader from '@/components/layout/PublicHeader';
import PublicFooter from '@/components/layout/PublicFooter';
import { BLOG_POSTS } from '@/lib/blog-data';
import { updateSEO } from '@/lib/seo';
import { Clock, ArrowRight, Sparkles } from 'lucide-react';

export default function BlogOverview() {
  useEffect(() => {
    const titleText = 'Fræðslugreinar og handbækur um vefauglýsingar | Birtingur';
    const descriptionText =
      'Lærðu hvernig á að auglýsa á netinu á áhrifaríkan hátt, græða á eigin vefsíðu með auglýsingatekjum og tryggja GDPR samræmi með kökulausri tækni.';
    updateSEO(titleText, descriptionText, '/handbaekur');

    window.scrollTo({ top: 0 });

    return () => {
      document.title = 'Birtingur';
    };
  }, []);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 flex flex-col font-sans antialiased overflow-x-hidden selection:bg-blue-600 selection:text-white">
      {/* Background Ambient Gradients */}
      <div className="absolute top-0 left-1/4 w-[600px] h-[600px] rounded-full bg-blue-500/5 blur-[120px] pointer-events-none -z-10" />
      <div className="absolute top-1/3 right-10 w-[500px] h-[500px] rounded-full bg-indigo-500/5 blur-[100px] pointer-events-none -z-10" />

      <PublicHeader />

      <main className="grow pt-24 pb-20">
        {/* Hero Section */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-12 pb-16 text-center">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-indigo-50 border border-indigo-100 text-indigo-700 text-xs font-bold mb-6 animate-pulse">
            <Sparkles className="w-3.5 h-3.5" />
            <span>SEO & Vefaukning</span>
          </div>
          <h1 className="text-4xl sm:text-5xl font-black text-slate-900 tracking-tight mb-4">
            Fræðslukerfi &{' '}
            <span className="bg-linear-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">
              Handbækur
            </span>
          </h1>
          <p className="max-w-2xl mx-auto text-base sm:text-lg text-slate-550 leading-relaxed">
            Hér finnurðu hagnýtar leiðbeiningar og greinar um hvernig þú getur hámarkað árangur
            vefauglýsinga, aukið tekjur af vefsvæðinu þínu og skilið kökulausa tækni.
          </p>
        </div>

        {/* Articles Grid */}
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {BLOG_POSTS.map((post) => (
              <article
                key={post.slug}
                className="group bg-white rounded-2xl border border-slate-200/80 hover:border-blue-300 hover:shadow-xl hover:shadow-blue-500/5 transition-all duration-300 flex flex-col h-full overflow-hidden"
              >
                <div className="p-6 sm:p-8 flex flex-col grow">
                  {/* Metadata */}
                  <div className="flex items-center justify-between gap-4 mb-4 text-xs font-semibold text-slate-400">
                    <span className="bg-slate-100 text-slate-650 px-2.5 py-1 rounded-lg">
                      {post.category}
                    </span>
                    <div className="flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5" />
                      <span>{post.readTime}</span>
                    </div>
                  </div>

                  {/* Title & Intro */}
                  <h2 className="text-xl font-bold text-slate-850 mb-3 group-hover:text-blue-600 transition-colors duration-200 line-clamp-2">
                    <Link to={`/handbaekur/${post.slug}`}>{post.title}</Link>
                  </h2>
                  <p className="text-slate-500 text-sm leading-relaxed mb-6 grow line-clamp-3">
                    {post.intro}
                  </p>

                  {/* Read More link */}
                  <div className="pt-4 border-t border-slate-100 mt-auto flex items-center justify-between">
                    <span className="text-xs text-slate-400 font-medium">{post.date}</span>
                    <Link
                      to={`/handbaekur/${post.slug}`}
                      className="inline-flex items-center gap-1.5 text-xs font-bold text-blue-600 hover:text-blue-700 transition"
                    >
                      Lesa grein
                      <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
                    </Link>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </div>
      </main>

      <PublicFooter />
    </div>
  );
}
