import { useState } from 'react';
import { useNavigate, useLocation, useSearchParams, Link } from 'react-router-dom';
import { useAuth } from '@/lib/auth-context';
import Logo from '@/components/ui/Logo';
import { MapPin } from 'lucide-react';

export type TabType = 'home' | 'advertisers' | 'publishers' | 'faq' | 'terms';

interface PublicHeaderProps {
  activeRegion?: {
    name: string;
    dative: string;
    genitive: string;
    parentName: string;
    regionLabel: string;
  } | null;
  onTabChange?: (tab: TabType) => void;
  currentTab?: TabType;
}

export default function PublicHeader({
  activeRegion,
  onTabChange,
  currentTab: propCurrentTab,
}: PublicHeaderProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();

  // Determine active tab if not passed as prop
  const getActiveTab = (): TabType => {
    if (propCurrentTab) return propCurrentTab;

    const path = location.pathname;
    if (path.startsWith('/auglysendur')) {
      return 'advertisers';
    }
    if (path.startsWith('/midlar')) {
      return 'publishers';
    }

    // Check main path search params
    const tabParam = searchParams.get('tab') as TabType;
    if (tabParam && ['home', 'faq', 'terms'].includes(tabParam)) {
      return tabParam;
    }
    return 'home';
  };

  const activeTab = getActiveTab();

  const handleTabClick = (tab: TabType) => {
    setMobileMenuOpen(false);
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

  const handleMinarSidur = () => {
    const lastRole = localStorage.getItem('ada_last_role');
    if (lastRole === 'advertiser') {
      navigate('/advertiser');
    } else if (lastRole === 'publisher') {
      navigate('/publisher');
    } else {
      navigate('/role');
    }
  };

  // Shadow color for the logo depending on the theme/tab
  const logoShadowClass =
    activeTab === 'publishers' ? 'shadow-indigo-500/10' : 'shadow-blue-500/10';

  return (
    <header className="sticky top-0 z-50 backdrop-blur-lg bg-white/85 border-b border-slate-200/60 transition-all duration-300">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-20 flex items-center justify-between">
        {/* Logo and Brand */}
        <div
          className="flex items-center gap-3 cursor-pointer"
          onClick={() => handleTabClick('home')}
        >
          <Logo size={40} className={`shadow-lg rounded-xl ${logoShadowClass}`} />
          <div className="flex flex-col sm:flex-row sm:items-center">
            <span className="font-extrabold text-2xl tracking-tight text-slate-900 leading-none">
              Birtingur
            </span>
            <div className="flex items-center mt-1 sm:mt-0">
              <span className="hidden sm:inline text-xs font-semibold px-2 py-0.5 ml-2 rounded-full bg-blue-50 text-blue-600 border border-blue-200/60">
                birtingur.app
              </span>
              {activeRegion && (
                <span
                  className={`text-[11px] font-bold px-2 py-0.5 ml-2 rounded-full flex items-center gap-1 border ${
                    activeTab === 'publishers'
                      ? 'bg-indigo-50 text-indigo-700 border-indigo-150'
                      : 'bg-blue-50 text-blue-700 border-blue-150'
                  }`}
                >
                  <MapPin size={10} />
                  {activeRegion.name}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Desktop Navigation Links */}
        <nav className="hidden md:flex items-center gap-1.5 lg:gap-3 bg-white/80 border border-slate-200/80 px-2 py-1.5 rounded-full shadow-xs">
          <button
            onClick={() => handleTabClick('home')}
            className={`px-4 py-1.5 rounded-full text-sm font-semibold transition-all duration-200 cursor-pointer ${
              activeTab === 'home'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100/80'
            }`}
          >
            Yfirlit
          </button>
          <button
            onClick={() => handleTabClick('advertisers')}
            className={`px-4 py-1.5 rounded-full text-sm font-semibold transition-all duration-200 cursor-pointer ${
              activeTab === 'advertisers'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100/80'
            }`}
          >
            Fyrir auglýsendur
          </button>
          <button
            onClick={() => handleTabClick('publishers')}
            className={`px-4 py-1.5 rounded-full text-sm font-semibold transition-all duration-200 cursor-pointer ${
              activeTab === 'publishers'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100/80'
            }`}
          >
            Fyrir útgefendur
          </button>
          <button
            onClick={() => handleTabClick('faq')}
            className={`px-4 py-1.5 rounded-full text-sm font-semibold transition-all duration-200 cursor-pointer ${
              activeTab === 'faq'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100/80'
            }`}
          >
            Spurningar (FAQ)
          </button>
        </nav>

        {/* CTA Buttons */}
        <div className="hidden md:flex items-center gap-4">
          {user ? (
            <button
              onClick={handleMinarSidur}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 font-bold text-sm text-white shadow-lg shadow-blue-600/20 hover:shadow-blue-500/30 transition-all duration-200 cursor-pointer"
            >
              Mínar síður <span className="material-symbols-outlined text-sm">arrow_forward</span>
            </button>
          ) : (
            <>
              <button
                onClick={() => navigate('/sign-in')}
                className="px-4 py-2.5 text-sm font-bold text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-xl transition-all cursor-pointer"
              >
                Skrá inn
              </button>
              <button
                onClick={() => navigate('/sign-in')}
                className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 font-bold text-sm text-white shadow-lg shadow-blue-600/20 hover:shadow-blue-500/30 transition-all duration-200 cursor-pointer"
              >
                Hefja auglýsingar
              </button>
            </>
          )}
        </div>

        {/* Mobile Menu Toggle */}
        <div className="md:hidden">
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="p-2 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition cursor-pointer"
          >
            <span className="material-symbols-outlined text-2xl">
              {mobileMenuOpen ? 'close' : 'menu'}
            </span>
          </button>
        </div>
      </div>

      {/* Mobile Navigation Panel */}
      {mobileMenuOpen && (
        <div className="md:hidden border-t border-slate-200 bg-white/95 px-4 py-6 space-y-3 shadow-xl animate-fade-in">
          <button
            onClick={() => handleTabClick('home')}
            className={`w-full text-left px-4 py-3 rounded-xl text-base font-semibold ${
              activeTab === 'home' ? 'bg-blue-600 text-white' : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            Yfirlit
          </button>
          <button
            onClick={() => handleTabClick('advertisers')}
            className={`w-full text-left px-4 py-3 rounded-xl text-base font-semibold ${
              activeTab === 'advertisers'
                ? 'bg-blue-600 text-white'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            Fyrir auglýsendur
          </button>
          <button
            onClick={() => handleTabClick('publishers')}
            className={`w-full text-left px-4 py-3 rounded-xl text-base font-semibold ${
              activeTab === 'publishers'
                ? 'bg-blue-600 text-white'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            Fyrir útgefendur
          </button>
          <button
            onClick={() => handleTabClick('faq')}
            className={`w-full text-left px-4 py-3 rounded-xl text-base font-semibold ${
              activeTab === 'faq' ? 'bg-blue-600 text-white' : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            Spurningar (FAQ)
          </button>

          <div className="pt-4 border-t border-slate-200/80 flex flex-col gap-3">
            {user ? (
              <button
                onClick={handleMinarSidur}
                className="w-full text-center py-3 rounded-xl bg-blue-600 font-bold text-white shadow-lg cursor-pointer"
              >
                Mínar síður
              </button>
            ) : (
              <>
                <button
                  onClick={() => navigate('/sign-in')}
                  className="w-full text-center py-3 rounded-xl border border-slate-200 font-bold text-slate-700 hover:bg-slate-50 cursor-pointer"
                >
                  Skrá inn
                </button>
                <button
                  onClick={() => navigate('/sign-in')}
                  className="w-full text-center py-3 rounded-xl bg-blue-600 font-bold text-white shadow-lg cursor-pointer"
                >
                  Hefja auglýsingar
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </header>
  );
}
