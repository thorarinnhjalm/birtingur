import { useNavigate } from 'react-router-dom';
import Logo from '@/components/ui/Logo';

interface PublicFooterProps {
  onTabChange?: (tab: 'home' | 'advertisers' | 'publishers' | 'faq' | 'terms') => void;
}

export default function PublicFooter({ onTabChange }: PublicFooterProps) {
  const navigate = useNavigate();

  const handleLinkClick = (tab: 'home' | 'advertisers' | 'publishers' | 'faq' | 'terms') => {
    if (onTabChange) {
      onTabChange(tab);
    } else {
      if (tab === 'advertisers') {
        navigate('/auglysendur');
      } else if (tab === 'publishers') {
        navigate('/midlar');
      } else if (tab === 'home') {
        navigate('/');
      } else {
        navigate(`/?tab=${tab}`);
      }
    }
  };

  return (
    <footer className="bg-white border-t border-slate-200/80 py-12 mt-16">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
          {/* Logo/Info */}
          <div className="space-y-4">
            <div
              className="flex items-center gap-2 cursor-pointer"
              onClick={() => handleLinkClick('home')}
            >
              <Logo size={32} className="shadow-md shadow-blue-500/10 rounded-lg" />
              <span className="font-extrabold text-lg text-slate-850">Birtingur</span>
            </div>
            <p className="text-xs text-slate-550 leading-relaxed">
              <strong>Neðri Hóll Hugmyndahús ehf.</strong>
              <br />
              Kt. 470126-2480 | VSK nr. 159950
              <br />
              Álfhólsvegi 97, 200 Kópavogur
            </p>
          </div>

          {/* Links Advertiser */}
          <div>
            <h4 className="text-xs uppercase font-extrabold tracking-wider text-slate-500 mb-3">
              Auglýsendur
            </h4>
            <ul className="space-y-2 text-xs">
              <li>
                <button
                  onClick={() => handleLinkClick('advertisers')}
                  className="text-slate-500 hover:text-slate-850 transition cursor-pointer bg-transparent border-0 p-0 font-normal"
                >
                  Stofna herferð
                </button>
              </li>
              <li>
                <button
                  onClick={() => handleLinkClick('advertisers')}
                  className="text-slate-500 hover:text-slate-850 transition cursor-pointer bg-transparent border-0 p-0 font-normal"
                >
                  Inneignir og greiðslur
                </button>
              </li>
            </ul>
          </div>

          {/* Links Publisher */}
          <div>
            <h4 className="text-xs uppercase font-extrabold tracking-wider text-slate-500 mb-3">
              Útgefendur
            </h4>
            <ul className="space-y-2 text-xs">
              <li>
                <button
                  onClick={() => handleLinkClick('publishers')}
                  className="text-slate-500 hover:text-slate-850 transition cursor-pointer bg-transparent border-0 p-0 font-normal"
                >
                  Sækja kóða
                </button>
              </li>
              <li>
                <button
                  onClick={() => handleLinkClick('publishers')}
                  className="text-slate-500 hover:text-slate-850 transition cursor-pointer bg-transparent border-0 p-0 font-normal"
                >
                  Tekjuöflun
                </button>
              </li>
            </ul>
          </div>

          {/* Legal / Contact */}
          <div>
            <h4 className="text-xs uppercase font-extrabold tracking-wider text-slate-500 mb-3">
              Þjónusta
            </h4>
            <ul className="space-y-2 text-xs text-slate-500">
              <li>
                Hafa samband:{' '}
                <a
                  href="mailto:info@birtingur.app"
                  className="text-slate-550 hover:text-slate-850 transition"
                >
                  info@birtingur.app
                </a>
              </li>
              <li>
                <button
                  onClick={() => handleLinkClick('faq')}
                  className="text-slate-500 hover:text-slate-850 transition cursor-pointer bg-transparent border-0 p-0 font-normal"
                >
                  Hjálparmiðstöð & FAQ
                </button>
              </li>
            </ul>
          </div>
        </div>

        <div className="pt-8 border-t border-slate-100 mt-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <span className="text-[10px] text-slate-500">
            © 2026 Birtingur (birtingur.app) – Neðri Hóll Hugmyndahús ehf. Allur réttur áskilinn.
          </span>
          <div className="flex gap-4 text-[10px] text-slate-550">
            <button
              onClick={() => handleLinkClick('terms')}
              className="hover:text-slate-800 transition cursor-pointer bg-transparent border-0 p-0 font-normal"
            >
              Notendaskilmálar
            </button>
            <button
              onClick={() => handleLinkClick('terms')}
              className="hover:text-slate-800 transition cursor-pointer bg-transparent border-0 p-0 font-normal"
            >
              Persónuverndarstefna
            </button>
          </div>
        </div>
      </div>
    </footer>
  );
}
