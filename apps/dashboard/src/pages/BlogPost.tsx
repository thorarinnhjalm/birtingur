import { useEffect } from 'react';
import { useParams, Link, Navigate } from 'react-router-dom';
import PublicHeader from '@/components/layout/PublicHeader';
import PublicFooter from '@/components/layout/PublicFooter';
import { BLOG_POSTS } from '@/lib/blog-data';
import { updateSEO } from '@/lib/seo';
import { Clock, ArrowLeft, ArrowRight, Share2 } from 'lucide-react';

export default function BlogPost() {
  const { slug } = useParams<{ slug: string }>();
  const post = BLOG_POSTS.find((p) => p.slug === slug);

  useEffect(() => {
    if (post) {
      updateSEO(`${post.title} | Birtingur`, post.description, `/handbaekur/${post.slug}`);
      window.scrollTo({ top: 0 });
    }

    return () => {
      document.title = 'Birtingur';
    };
  }, [post]);

  if (!post) {
    return <Navigate to="/handbaekur" replace />;
  }

  // Simple share handler
  const handleShare = () => {
    if (navigator.share) {
      navigator
        .share({
          title: post.title,
          text: post.description,
          url: window.location.href,
        })
        .catch(() => {});
    } else {
      navigator.clipboard.writeText(window.location.href);
      alert('Tengill afritaður í klemmuspjald!');
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 flex flex-col font-sans antialiased overflow-x-hidden selection:bg-blue-600 selection:text-white">
      {/* Background Ambient Gradients */}
      <div className="absolute top-0 left-1/4 w-[600px] h-[600px] rounded-full bg-blue-500/5 blur-[120px] pointer-events-none -z-10" />
      <div className="absolute top-1/3 right-10 w-[500px] h-[500px] rounded-full bg-indigo-500/5 blur-[100px] pointer-events-none -z-10" />

      <PublicHeader />

      <main className="grow pt-28 pb-20">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* Back Button */}
          <Link
            to="/handbaekur"
            className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-500 hover:text-slate-800 transition mb-8 group"
          >
            <ArrowLeft className="w-3.5 h-3.5 group-hover:-translate-x-0.5 transition-transform" />
            Til baka í handbækur
          </Link>

          {/* Article Header */}
          <header className="mb-10">
            <div className="flex items-center justify-between gap-4 mb-4 text-xs font-semibold text-slate-400">
              <span className="bg-slate-100 text-slate-650 px-2.5 py-1 rounded-lg">
                {post.category}
              </span>
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5" />
                  <span>{post.readTime}</span>
                </div>
                <span>•</span>
                <span>{post.date}</span>
              </div>
            </div>
            <h1 className="text-3xl sm:text-4xl font-extrabold text-slate-900 tracking-tight leading-tight mb-6">
              {post.title}
            </h1>
            <p className="text-lg text-slate-650 font-medium leading-relaxed border-l-4 border-blue-500 pl-4 py-1 mb-8">
              {post.intro}
            </p>
          </header>

          {/* Article Content */}
          <div className="prose prose-slate max-w-none text-slate-700 leading-relaxed space-y-6">
            {post.content.map((block, idx) => {
              if (block.type === 'p') {
                return (
                  <p key={idx} className="text-base sm:text-[17px] text-slate-650">
                    {block.text}
                  </p>
                );
              }
              if (block.type === 'h2') {
                return (
                  <h2 key={idx} className="text-2xl font-black text-slate-905 pt-6 pb-2">
                    {block.text}
                  </h2>
                );
              }
              if (block.type === 'h3') {
                return (
                  <h3 key={idx} className="text-lg font-bold text-slate-850 pt-4 pb-1">
                    {block.text}
                  </h3>
                );
              }
              if (block.type === 'ul' && block.items) {
                return (
                  <ul key={idx} className="list-disc pl-6 space-y-2 text-slate-650">
                    {block.items.map((item, itemIdx) => (
                      <li key={itemIdx}>{item}</li>
                    ))}
                  </ul>
                );
              }
              if (block.type === 'ol' && block.items) {
                return (
                  <ol key={idx} className="list-decimal pl-6 space-y-2 text-slate-650">
                    {block.items.map((item, itemIdx) => (
                      <li key={itemIdx}>{item}</li>
                    ))}
                  </ol>
                );
              }
              return null;
            })}
          </div>

          {/* Article Actions */}
          <div className="flex items-center justify-between pt-8 border-t border-slate-200 mt-12 mb-16">
            <button
              onClick={handleShare}
              className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-500 hover:text-slate-800 transition cursor-pointer bg-transparent border-0 p-0"
            >
              <Share2 className="w-3.5 h-3.5" />
              Deila grein
            </button>
          </div>

          {/* Call To Action Box */}
          <div className="bg-linear-to-br from-blue-600 to-indigo-650 text-white rounded-2xl p-8 sm:p-10 shadow-xl shadow-blue-500/10 text-center relative overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 bg-white/5 rounded-full blur-2xl pointer-events-none" />
            <h3 className="text-2xl font-black mb-3">Viltu auglýsa eða afla tekna?</h3>
            <p className="text-white/80 text-sm max-w-lg mx-auto mb-6 leading-relaxed">
              Birtingur er sjálfvirk, kökulaus og persónuverndarvæn birtingaþjónusta á Íslandi.
              Skráðu þig á biðlista og við höfum samband um leið og opnað er.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <Link
                to="/role"
                className="bg-white text-blue-700 px-6 py-3 rounded-xl text-xs font-black hover:bg-slate-50 transition shadow-sm w-full sm:w-auto"
              >
                Stofna aðgang
              </Link>
              <Link
                to="/faq"
                className="text-white hover:text-white/80 transition text-xs font-bold flex items-center gap-1 w-full sm:w-auto justify-center"
              >
                Algengar spurningar
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>
          </div>
        </div>
      </main>

      <PublicFooter />
    </div>
  );
}
