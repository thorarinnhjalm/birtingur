import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/lib/auth-context';

type TabType = 'home' | 'advertisers' | 'publishers' | 'faq' | 'terms';

export default function LandingPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [currentTab, setCurrentTab] = useState<TabType>('home');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { user } = useAuth();
  const navigate = useNavigate();

  // Handle URL synchronisation with search params (e.g. ?tab=faq)
  useEffect(() => {
    const tabParam = searchParams.get('tab') as TabType;
    if (tabParam && ['home', 'advertisers', 'publishers', 'faq', 'terms'].includes(tabParam)) {
      setCurrentTab(tabParam);
    } else {
      setCurrentTab('home');
    }
  }, [searchParams]);

  const changeTab = (tab: TabType) => {
    setSearchParams(tab === 'home' ? {} : { tab });
    setCurrentTab(tab);
    setMobileMenuOpen(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
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

  // State for Sandbox Widget Demo
  const [sandboxSize, setSandboxSize] = useState<'300x250' | '728' | '970'>('300x250');

  // FAQ state
  const [openFaqIndex, setOpenFaqIndex] = useState<number | null>(null);

  const toggleFaq = (index: number) => {
    setOpenFaqIndex(openFaqIndex === index ? null : index);
  };

  // Calculator State
  const [calcMode, setCalcMode] = useState<'advertiser' | 'publisher'>('advertiser');
  const [advBudget, setAdvBudget] = useState<number>(25000);
  const [pubPageviews, setPubPageviews] = useState<number>(100000);
  const [pubFillRate, setPubFillRate] = useState<number>(50);

  // Calculations
  // Advertiser estimate: 550 kr. CPM (per 1,000 views)
  const advertiserImpressions = Math.round((advBudget / 550) * 1000);
  // Publisher estimate: 440 kr. net CPM (550 kr. - 20% platform fee = 440 kr.)
  const publisherRevenue = Math.round((pubPageviews * (pubFillRate / 100) * 440) / 1000);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 flex flex-col font-sans antialiased overflow-x-hidden selection:bg-primary selection:text-white">
      {/* Background Ambient Gradients */}
      <div className="absolute top-0 left-1/4 w-[600px] h-[600px] rounded-full bg-blue-500/5 blur-[120px] pointer-events-none -z-10" />
      <div className="absolute top-1/3 right-10 w-[500px] h-[500px] rounded-full bg-violet-500/5 blur-[100px] pointer-events-none -z-10" />

      {/* HEADER */}
      <header className="sticky top-0 z-50 backdrop-blur-lg bg-white/85 border-b border-slate-200/60 transition-all duration-300">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-20 flex items-center justify-between">
          {/* Logo */}
          <div className="flex items-center gap-3 cursor-pointer" onClick={() => changeTab('home')}>
            <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center font-extrabold text-xl text-white shadow-lg shadow-blue-500/20">
              B
            </div>
            <div>
              <span className="font-extrabold text-2xl tracking-tight text-slate-900">
                Birtingur
              </span>
              <span className="hidden sm:inline text-xs font-semibold px-2 py-0.5 ml-2 rounded-full bg-blue-50 text-blue-600 border border-blue-200/60">
                birtingur.app
              </span>
            </div>
          </div>

          {/* Desktop Navigation Links */}
          <nav className="hidden md:flex items-center gap-1.5 lg:gap-3 bg-white/80 border border-slate-200/80 px-2 py-1.5 rounded-full shadow-xs">
            <button
              onClick={() => changeTab('home')}
              className={`px-4 py-1.5 rounded-full text-sm font-semibold transition-all duration-200 cursor-pointer ${currentTab === 'home' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100/80'}`}
            >
              Yfirlit
            </button>
            <button
              onClick={() => changeTab('advertisers')}
              className={`px-4 py-1.5 rounded-full text-sm font-semibold transition-all duration-200 cursor-pointer ${currentTab === 'advertisers' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100/80'}`}
            >
              Fyrir auglýsendur
            </button>
            <button
              onClick={() => changeTab('publishers')}
              className={`px-4 py-1.5 rounded-full text-sm font-semibold transition-all duration-200 cursor-pointer ${currentTab === 'publishers' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100/80'}`}
            >
              Fyrir útgefendur
            </button>
            <button
              onClick={() => changeTab('faq')}
              className={`px-4 py-1.5 rounded-full text-sm font-semibold transition-all duration-200 cursor-pointer ${currentTab === 'faq' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100/80'}`}
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
              onClick={() => changeTab('home')}
              className={`w-full text-left px-4 py-3 rounded-xl text-base font-semibold ${currentTab === 'home' ? 'bg-blue-600 text-white' : 'text-slate-600 hover:bg-slate-100'}`}
            >
              Yfirlit
            </button>
            <button
              onClick={() => changeTab('advertisers')}
              className={`w-full text-left px-4 py-3 rounded-xl text-base font-semibold ${currentTab === 'advertisers' ? 'bg-blue-600 text-white' : 'text-slate-600 hover:bg-slate-100'}`}
            >
              Fyrir auglýsendur
            </button>
            <button
              onClick={() => changeTab('publishers')}
              className={`w-full text-left px-4 py-3 rounded-xl text-base font-semibold ${currentTab === 'publishers' ? 'bg-blue-600 text-white' : 'text-slate-600 hover:bg-slate-100'}`}
            >
              Fyrir útgefendur
            </button>
            <button
              onClick={() => changeTab('faq')}
              className={`w-full text-left px-4 py-3 rounded-xl text-base font-semibold ${currentTab === 'faq' ? 'bg-blue-600 text-white' : 'text-slate-600 hover:bg-slate-100'}`}
            >
              Spurningar (FAQ)
            </button>

            <div className="pt-4 border-t border-slate-200/80 flex flex-col gap-3">
              {user ? (
                <button
                  onClick={handleMinarSidur}
                  className="w-full text-center py-3 rounded-xl bg-blue-600 font-bold text-white shadow-lg"
                >
                  Mínar síður
                </button>
              ) : (
                <>
                  <button
                    onClick={() => navigate('/sign-in')}
                    className="w-full text-center py-3 rounded-xl border border-slate-200 font-bold text-slate-700 hover:bg-slate-50"
                  >
                    Skrá inn
                  </button>
                  <button
                    onClick={() => navigate('/sign-in')}
                    className="w-full text-center py-3 rounded-xl bg-blue-600 font-bold text-white shadow-lg"
                  >
                    Hefja auglýsingar
                  </button>
                </>
              )}
            </div>
          </div>
        )}
      </header>

      {/* MAIN CONTENT HOUSING CHOSEN TAB */}
      <main className="grow">
        {currentTab === 'home' && (
          <div className="space-y-16 sm:space-y-24 md:space-y-32 pb-24">
            {/* HERO SECTION */}
            <section className="relative pt-10 sm:pt-16 md:pt-24 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-8 items-center">
                {/* Text Block */}
                <div className="lg:col-span-7 flex flex-col items-center lg:items-start text-center lg:text-left space-y-6">
                  {/* Dynamic Tag */}
                  <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-50 text-blue-600 border border-blue-200/80 text-xs font-semibold tracking-wide uppercase">
                    <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
                    Sjálfvirk miðlun auglýsinga á Íslandi
                  </div>

                  {/* Main Headline */}
                  <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight text-slate-900 leading-tight">
                    Auglýstu á vaxandi neti íslenskra samstarfsvefja.
                    <span className="block mt-2 bg-linear-to-r from-blue-600 via-sky-600 to-indigo-600 bg-clip-text text-transparent">
                      Einfalt og án milliliða.
                    </span>
                  </h1>

                  {/* Subtitle */}
                  <p className="text-base sm:text-lg lg:text-xl text-slate-500 max-w-xl font-medium leading-relaxed">
                    Birtingur (birtingur.app) er nútímalegur sjálfsafgreiðsluvettvangur sem tengir
                    saman íslenska útgefendur og auglýsendur. Stofnaðu herferðir á nokkrum mínútum
                    eða byrjaðu að græða á vefnum þínum í dag.
                  </p>

                  {/* Actions */}
                  <div className="flex flex-col sm:flex-row items-center gap-4 w-full sm:w-auto">
                    <button
                      onClick={() => changeTab('advertisers')}
                      className="w-full sm:w-auto px-8 py-4 rounded-2xl bg-linear-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-extrabold text-base shadow-xl shadow-blue-500/10 hover:shadow-blue-500/25 transition-all duration-300 transform hover:-translate-y-0.5 flex items-center justify-center gap-2 cursor-pointer"
                    >
                      Kaupa auglýsingar (Auglýsandi){' '}
                      <span className="material-symbols-outlined">campaign</span>
                    </button>
                    <button
                      onClick={() => changeTab('publishers')}
                      className="w-full sm:w-auto px-8 py-4 rounded-2xl bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 hover:text-slate-900 font-extrabold text-base transition-all duration-300 flex items-center justify-center gap-2 cursor-pointer"
                    >
                      Selja auglýsingapláss (Útgefandi){' '}
                      <span className="material-symbols-outlined text-lg">add_to_queue</span>
                    </button>
                  </div>
                </div>

                {/* Visual Bento Mockup */}
                <div className="lg:col-span-5 relative w-full flex justify-center">
                  <div className="relative w-full max-w-md p-6 rounded-3xl bg-white border border-slate-200/80 shadow-xl shadow-slate-100/50 overflow-hidden">
                    <div className="absolute top-0 right-0 w-32 h-32 rounded-full bg-blue-500/5 blur-2xl -z-10" />

                    {/* Header of Mockup */}
                    <div className="flex items-center justify-between pb-4 border-b border-slate-150 mb-5">
                      <div className="flex items-center gap-2">
                        <span className="w-3 h-3 rounded-full bg-red-400" />
                        <span className="w-3 h-3 rounded-full bg-yellow-400" />
                        <span className="w-3 h-3 rounded-full bg-green-400" />
                      </div>
                      <span className="text-xs font-semibold text-slate-400">
                        Mínar herferðir (Mockup)
                      </span>
                    </div>

                    {/* Stats List */}
                    <div className="space-y-4">
                      {/* Metric Card */}
                      <div className="p-4 rounded-2xl bg-slate-50 border border-slate-150 flex items-center justify-between">
                        <div>
                          <span className="text-xs text-slate-500 font-semibold block mb-0.5">
                            Sýningar samtals
                          </span>
                          <span className="text-xl font-extrabold text-slate-900">1.248.912</span>
                        </div>
                        <div className="w-9 h-9 rounded-xl bg-blue-50 flex items-center justify-center text-blue-600">
                          <span className="material-symbols-outlined">visibility</span>
                        </div>
                      </div>

                      {/* Chart Grid */}
                      <div className="grid grid-cols-2 gap-4">
                        <div className="p-4 rounded-2xl bg-slate-50 border border-slate-150">
                          <span className="text-xs text-slate-500 font-semibold block mb-1">
                            Smellihlutfall
                          </span>
                          <span className="text-lg font-extrabold text-green-600">1.82%</span>
                          <span className="text-[10px] text-green-600 font-semibold block mt-0.5">
                            ↑ 0.4% vs. í gær
                          </span>
                        </div>
                        <div className="p-4 rounded-2xl bg-slate-50 border border-slate-150">
                          <span className="text-xs text-slate-500 font-semibold block mb-1">
                            Eftirstöðvar
                          </span>
                          <span className="text-lg font-extrabold text-blue-600">42.500 kr.</span>
                          <span className="text-[10px] text-slate-500 font-semibold block mt-0.5">
                            Næsta áfylling 10. júní
                          </span>
                        </div>
                      </div>

                      {/* Active Campaign Row */}
                      <div className="p-4 rounded-2xl bg-blue-50 border border-blue-100/80 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-lg bg-blue-600 flex items-center justify-center text-white">
                            <span className="material-symbols-outlined text-lg font-bold">
                              campaign
                            </span>
                          </div>
                          <div>
                            <span className="text-xs text-slate-500 block font-medium">
                              Í gangi
                            </span>
                            <span className="text-sm font-bold text-slate-800">Vorútsala 2026</span>
                          </div>
                        </div>
                        <span className="text-[10px] font-bold text-blue-600 bg-blue-100/50 px-2 py-0.5 rounded-full">
                          Virk
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </section>

            {/* DYNAMIC PLATFORM CALCULATOR */}
            <section className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
              <div className="p-8 sm:p-10 rounded-3xl bg-white border border-slate-200/80 shadow-xl shadow-slate-100/50 relative overflow-hidden">
                {/* Background decorative blob */}
                <div className="absolute top-0 right-0 w-48 h-48 rounded-full bg-blue-500/5 blur-3xl pointer-events-none" />

                <div className="text-center space-y-4 mb-8">
                  <span className="text-xs font-bold uppercase tracking-wider text-blue-600 bg-blue-50 px-3 py-1 rounded-full border border-blue-100">
                    Áætlaður árangur og tekjur
                  </span>
                  <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900">
                    Reiknaðu ávinninginn þinn
                  </h2>
                  <p className="text-sm text-slate-500 max-w-xl mx-auto">
                    Hér geturðu áætlað birtingafjölda fyrir herferðirnar þínar eða áætlað
                    mánaðarlegar tekjur af vefnum þínum.
                  </p>
                </div>

                {/* Switch tabs */}
                <div className="flex justify-center mb-8">
                  <div className="inline-flex p-1 rounded-xl bg-slate-100 border border-slate-200">
                    <button
                      onClick={() => setCalcMode('advertiser')}
                      className={`px-5 py-2 rounded-lg text-xs sm:text-sm font-bold transition cursor-pointer ${calcMode === 'advertiser' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-550 hover:text-slate-800'}`}
                    >
                      Kaupandi (Auglýsandi)
                    </button>
                    <button
                      onClick={() => setCalcMode('publisher')}
                      className={`px-5 py-2 rounded-lg text-xs sm:text-sm font-bold transition cursor-pointer ${calcMode === 'publisher' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-550 hover:text-slate-800'}`}
                    >
                      Söluaðili (Útgefandi)
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-12 gap-8 items-center">
                  {/* Slider controls block */}
                  <div className="md:col-span-7 space-y-6">
                    {calcMode === 'advertiser' ? (
                      <div className="space-y-4">
                        <div className="flex justify-between items-center">
                          <label className="text-sm font-bold text-slate-700">
                            Mánaðarleg auglýsingafjárhæð
                          </label>
                          <span className="text-base font-extrabold text-blue-600">
                            {advBudget.toLocaleString('is-IS')} kr.
                          </span>
                        </div>
                        <input
                          type="range"
                          min="5000"
                          max="500000"
                          step="5000"
                          value={advBudget}
                          onChange={(e) => setAdvBudget(Number(e.target.value))}
                          className="custom-slider"
                        />
                        <div className="flex justify-between text-[10px] text-slate-400 font-semibold">
                          <span>5.000 kr.</span>
                          <span>250.000 kr.</span>
                          <span>500.000 kr.</span>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-6">
                        {/* Pageviews slider */}
                        <div className="space-y-4">
                          <div className="flex justify-between items-center">
                            <label className="text-sm font-bold text-slate-700">
                              Mánaðarlegar flettingar (Birtingarpláss)
                            </label>
                            <span className="text-base font-extrabold text-blue-600">
                              {pubPageviews.toLocaleString('is-IS')} flettingar
                            </span>
                          </div>
                          <input
                            type="range"
                            min="10000"
                            max="2000000"
                            step="10000"
                            value={pubPageviews}
                            onChange={(e) => setPubPageviews(Number(e.target.value))}
                            className="custom-slider"
                          />
                          <div className="flex justify-between text-[10px] text-slate-400 font-semibold">
                            <span>10.000</span>
                            <span>1.000.000</span>
                            <span>2.000.000</span>
                          </div>
                        </div>

                        {/* Fill rate slider */}
                        <div className="space-y-4">
                          <div className="flex justify-between items-center">
                            <label className="text-sm font-bold text-slate-700">
                              Nýtingarhlutfall (Fill Rate)
                            </label>
                            <span className="text-base font-extrabold text-blue-600">
                              {pubFillRate}%
                            </span>
                          </div>
                          <input
                            type="range"
                            min="10"
                            max="100"
                            step="5"
                            value={pubFillRate}
                            onChange={(e) => setPubFillRate(Number(e.target.value))}
                            className="custom-slider"
                          />
                          <div className="flex justify-between text-[10px] text-slate-400 font-semibold">
                            <span>10%</span>
                            <span>50%</span>
                            <span>100%</span>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Calculations display block */}
                  <div className="md:col-span-5 p-6 rounded-2xl bg-slate-50 border border-slate-200 text-center flex flex-col justify-center min-h-[180px]">
                    {calcMode === 'advertiser' ? (
                      <div className="space-y-3">
                        <span className="text-xs font-bold uppercase text-slate-500 tracking-wider">
                          Áætlaður birtingafjöldi
                        </span>
                        <div className="text-3xl sm:text-4xl font-black text-slate-900 tracking-tight">
                          {advertiserImpressions.toLocaleString('is-IS')}
                        </div>
                        <span className="text-[10px] text-slate-455 font-semibold block">
                          flettingar á vaxandi íslensku samstarfsneti
                        </span>
                        <div className="pt-2 border-t border-slate-200 text-[10px] text-slate-500 leading-relaxed">
                          Miðað við 550 kr. meðal-CPM. Þú greiðir aðeins fyrir raunverulegar
                          birtingar.
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        <span className="text-xs font-bold uppercase text-slate-500 tracking-wider">
                          Áætlaðar mánaðartekjur
                        </span>
                        <div className="text-3xl sm:text-4xl font-black text-green-600 tracking-tight">
                          {publisherRevenue.toLocaleString('is-IS')} kr.
                        </div>
                        <span className="text-[10px] text-slate-455 font-semibold block">
                          greitt út beint á þinn bankareikning
                        </span>
                        <div className="pt-2 border-t border-slate-200 text-[10px] text-slate-500 leading-relaxed">
                          Miðað við 440 kr. nettó-CPM til þín (eftir 20% flatgreidda þóknun kerfis).
                          Greiðslur sendar 1. virka dag.
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </section>

            {/* DYNAMIC INTERACTIVE AD SANDBOX */}
            <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
              <div className="p-8 sm:p-12 rounded-3xl bg-white border border-slate-200/80 shadow-xl shadow-slate-100/50 relative overflow-hidden">
                <div className="absolute top-0 left-0 w-64 h-64 rounded-full bg-indigo-500/5 blur-3xl -z-10" />

                <div className="max-w-3xl mx-auto text-center space-y-4 mb-12">
                  <span className="text-xs font-bold uppercase tracking-wider text-blue-600 bg-blue-50 px-3 py-1 rounded-full border border-blue-100">
                    Sjáðu hvernig það virkar
                  </span>
                  <h2 className="text-3xl sm:text-4xl font-extrabold text-slate-900">
                    Gagnvirk prufa (Live Ad Sandbox)
                  </h2>
                  <p className="text-base text-slate-500">
                    Veldu auglýsingastærð hér fyrir neðan til að sjá hvernig borðarnir aðlagast
                    vefnum og hvernig einfaldi HTML kóðinn uppfærist sjálfkrafa.
                  </p>
                </div>

                {/* Sandbox Controls */}
                <div className="flex flex-wrap justify-center gap-3 mb-8">
                  <button
                    onClick={() => setSandboxSize('300x250')}
                    className={`px-5 py-2.5 rounded-xl text-sm font-bold transition cursor-pointer ${sandboxSize === '300x250' ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20' : 'bg-slate-100 border border-slate-200 text-slate-600 hover:text-slate-900'}`}
                  >
                    300x250 (Hliðarborði)
                  </button>
                  <button
                    onClick={() => setSandboxSize('728')}
                    className={`px-5 py-2.5 rounded-xl text-sm font-bold transition cursor-pointer ${sandboxSize === '728' ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20' : 'bg-slate-100 border border-slate-200 text-slate-600 hover:text-slate-900'}`}
                  >
                    728x90 (Leiðari)
                  </button>
                  <button
                    onClick={() => setSandboxSize('970')}
                    className={`px-5 py-2.5 rounded-xl text-sm font-bold transition cursor-pointer ${sandboxSize === '970' ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20' : 'bg-slate-100 border border-slate-200 text-slate-600 hover:text-slate-900'}`}
                  >
                    970x250 (Risaborði)
                  </button>
                </div>

                {/* Visual Live Sandbox Box */}
                <div className="bg-slate-50 border border-slate-200 rounded-2xl p-6 min-h-[320px] flex items-center justify-center overflow-x-auto mb-8">
                  {/* Dynamic Box Size based on state */}
                  <div
                    className="border border-slate-200 bg-white p-4 rounded-xl flex flex-col justify-between shadow-md relative overflow-hidden transition-all duration-300"
                    style={{
                      width:
                        sandboxSize === '300x250'
                          ? '300px'
                          : sandboxSize === '728'
                            ? '728px'
                            : '970px',
                      height: sandboxSize === '300x250' ? '250px' : '120px',
                    }}
                  >
                    <div className="absolute inset-0 bg-linear-to-r from-blue-600/5 via-indigo-600/5 to-transparent pointer-events-none" />

                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded bg-blue-600 flex items-center justify-center font-black text-xs text-white">
                          B
                        </div>
                        <span className="text-xs font-bold text-slate-800">birtingur.app</span>
                      </div>
                      <span className="text-[10px] uppercase font-bold tracking-wider text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200">
                        Auglýsing
                      </span>
                    </div>

                    <div className="my-2">
                      <h4 className="font-extrabold text-slate-800 text-sm sm:text-base leading-tight">
                        Einfalt og áhrifaríkt auglýsingaflæði
                      </h4>
                      <p className="text-xs text-slate-500 mt-1 line-clamp-2">
                        Settu upp herferð á nokkrum mínútum og náðu til markhóps þíns á okkar
                        samstarfsvefjum.
                      </p>
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-semibold text-slate-400">
                        {sandboxSize === '300x250'
                          ? '300x250 px'
                          : sandboxSize === '728'
                            ? '728x90 px'
                            : '970x250 px'}
                      </span>
                      <button className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 font-extrabold text-xs text-white transition">
                        Kynna sér málið
                      </button>
                    </div>
                  </div>
                </div>

                {/* Code Window Panel */}
                <div className="max-w-2xl mx-auto rounded-xl bg-slate-950 border border-slate-900 overflow-hidden shadow-lg">
                  <div className="px-4 py-2 border-b border-slate-900 flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-400">
                      HTML-kóði fyrir útgefanda
                    </span>
                    <span className="text-[10px] font-mono text-slate-500">
                      Afritaðu á vefsíðuna þína
                    </span>
                  </div>
                  <div className="p-4 font-mono text-xs text-blue-400 bg-slate-950 overflow-x-auto leading-relaxed">
                    <code className="block select-all">
                      {`<!-- Settu þetta þar sem auglýsingin á að birtast -->\n`}
                      {`<div data-adplatform-slot="slot_demo_id"\n`}
                      {`     data-adplatform-width="${sandboxSize === '300x250' ? '300' : sandboxSize === '728' ? '728' : '970'}"\n`}
                      {`     data-adplatform-height="${sandboxSize === '300x250' ? '250' : '90'}"></div>\n\n`}
                      {`<!-- Skriftan þarf aðeins að koma einu sinni á síðunni -->\n`}
                      {`<script async src="https://cdn.birtingur.app/widget.js"></script>`}
                    </code>
                  </div>
                </div>
              </div>
            </section>

            {/* CORE BENEFITS SECTION (BENTO GRID) */}
            <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
              <div className="max-w-3xl mx-auto text-center space-y-4 mb-16">
                <h2 className="text-3xl sm:text-4xl font-extrabold text-slate-900">
                  Einfaldari vinnubrögð
                </h2>
                <p className="text-base text-slate-500">
                  Birtingur (birtingur.app) er sérsniðin lausn til að leysa algengustu vandamálin
                  við sölu og birtingu vefauglýsinga.
                </p>
              </div>

              {/* Bento Grid */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {/* Block 1 */}
                <div className="p-8 rounded-3xl bg-white border border-slate-200/80 shadow-xs hover:shadow-md transition-all duration-300 flex flex-col justify-between space-y-6">
                  <div className="w-12 h-12 rounded-2xl bg-blue-50 flex items-center justify-center text-blue-600">
                    <span className="material-symbols-outlined text-2xl font-bold">
                      verified_user
                    </span>
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-slate-900 mb-2">100% Gæðastýring</h3>
                    <p className="text-sm text-slate-500 leading-relaxed">
                      Útgefendur geta samþykkt eða hafnað öllu efni áður en það fer í loftið á
                      þeirra vef í gegnum sérstaka samþykkisbiðröð (Approval Queue).
                    </p>
                  </div>
                </div>

                {/* Block 2 */}
                <div className="p-8 rounded-3xl bg-white border border-slate-200/80 shadow-xs hover:shadow-md transition-all duration-300 flex flex-col justify-between space-y-6">
                  <div className="w-12 h-12 rounded-2xl bg-blue-50 flex items-center justify-center text-blue-600">
                    <span className="material-symbols-outlined text-2xl font-bold">speed</span>
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-slate-900 mb-2">Engar tafir</h3>
                    <p className="text-sm text-slate-500 leading-relaxed">
                      Skriftan okkar (widget.js) er undir 5KB að stærð og hleðst í bakgrunni
                      (async). Hún tefur aldrei hleðslu á vefsíðum og hefur engin áhrif á
                      leitarvélabestun (SEO).
                    </p>
                  </div>
                </div>

                {/* Block 3 */}
                <div className="p-8 rounded-3xl bg-white border border-slate-200/80 shadow-xs hover:shadow-md transition-all duration-300 flex flex-col justify-between space-y-6">
                  <div className="w-12 h-12 rounded-2xl bg-blue-50 flex items-center justify-center text-blue-600">
                    <span className="material-symbols-outlined text-2xl font-bold">security</span>
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-slate-900 mb-2">
                      Persónuverndarvænt (GDPR)
                    </h3>
                    <p className="text-sm text-slate-500 leading-relaxed">
                      Við notum engar persónugreinanlegar vafrakökur til að fylgjast með notendum.
                      Miðunin byggir á samhengi efnisins (contextual targeting) og landfræði, sem
                      einfaldar lagalegt samræmi.
                    </p>
                  </div>
                </div>
              </div>
            </section>

            {/* MANIFESTO SECTION */}
            <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-16 sm:mt-24">
              <div className="relative rounded-3xl bg-slate-900 text-white p-8 sm:p-12 md:p-16 border border-slate-800 shadow-2xl overflow-hidden">
                <div className="absolute top-0 right-0 w-96 h-96 rounded-full bg-blue-500/10 blur-[100px] pointer-events-none -z-10" />
                <div className="absolute bottom-0 left-0 w-80 h-80 rounded-full bg-violet-500/10 blur-[80px] pointer-events-none -z-10" />

                <div className="max-w-3xl mx-auto text-center space-y-4 mb-12">
                  <span className="text-xs font-bold uppercase tracking-wider text-blue-400 bg-blue-950/50 px-3 py-1 rounded-full border border-blue-900/50">
                    Okkar stefna
                  </span>
                  <h2 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight">
                    Stefnuyfirlýsing Birtingar
                  </h2>
                  <p className="text-base text-slate-400 font-medium max-w-xl mx-auto">
                    Við trúum því að hægt sé að reka árangursríka auglýsingamiðlun á íslenska vefnum
                    án þess að fórna notendaupplifun eða persónuvernd.
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                  {/* Point 1 */}
                  <div className="space-y-4 p-6 rounded-2xl bg-slate-850/40 border border-slate-800/80">
                    <div className="w-12 h-12 rounded-xl bg-blue-950 border border-blue-900/50 flex items-center justify-center text-blue-400">
                      <span className="material-symbols-outlined text-2xl font-bold">
                        equalizer
                      </span>
                    </div>
                    <h3 className="text-lg font-bold text-white">Gagnsætt og samræmt verðlag</h3>
                    <p className="text-xs text-slate-400 leading-relaxed font-medium">
                      Við bjóðum <strong>flatt CPM verð upp á 550 kr.</strong> á öllu netinu fyrir
                      almennar sýningar, en styðjum einnig **fasta tímabilsleigu** (t.d. fast verð
                      fyrir 30 daga) þar sem útgefendur ráða leiguverðinu sjálfir.
                    </p>
                  </div>

                  {/* Point 2 */}
                  <div className="space-y-4 p-6 rounded-2xl bg-slate-850/40 border border-slate-800/80">
                    <div className="w-12 h-12 rounded-xl bg-blue-950 border border-blue-900/50 flex items-center justify-center text-blue-400">
                      <span className="material-symbols-outlined text-2xl font-bold">filter_1</span>
                    </div>
                    <h3 className="text-lg font-bold text-white">Eitt hólf, ein auglýsing</h3>
                    <p className="text-xs text-slate-400 leading-relaxed font-medium">
                      Við bönnum síendurtekna hólfaflettingu (auto-refresh loop) og óreiðu. Í hverju
                      auglýsingaplássi birtist aðeins{' '}
                      <strong>ein gæðamikil auglýsing í senn</strong>. Lesendur fá rólegri vef og
                      auglýsendur fá óskipta athygli.
                    </p>
                  </div>

                  {/* Point 3 */}
                  <div className="space-y-4 p-6 rounded-2xl bg-slate-850/40 border border-slate-800/80">
                    <div className="w-12 h-12 rounded-xl bg-blue-950 border border-blue-900/50 flex items-center justify-center text-blue-400">
                      <span className="material-symbols-outlined text-2xl font-bold">cookie</span>
                    </div>
                    <h3 className="text-lg font-bold text-white">
                      Persónuvernd í fyrirrúmi (Cookie-free)
                    </h3>
                    <p className="text-xs text-slate-400 leading-relaxed font-medium">
                      Engin vefsporun. Hægt er að miða herferðir við samhengi efnisins og tiltekin
                      landsvæði án þess að nota vafrakökur. Þetta tryggir fullt samræmi við
                      GDPR-kröfur og gerir það að verkum að vefurinn hleðst mun hraðar.
                    </p>
                  </div>
                </div>
              </div>
            </section>
          </div>
        )}
        {/* TAB: FOR ADVERTISERS */}
        {currentTab === 'advertisers' && (
          <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-16 md:py-20 space-y-20">
            {/* Header */}
            <div className="space-y-4 text-center">
              <span className="text-xs font-bold uppercase tracking-wider text-blue-600 bg-blue-50 px-3 py-1 rounded-full border border-blue-100">
                Markaðsmiðlun
              </span>
              <h1 className="text-4xl sm:text-5xl font-black text-slate-900 leading-tight">
                Náðu til markhóps þíns á Íslandi
              </h1>
              <p className="text-base sm:text-lg text-slate-500 max-w-2xl mx-auto font-medium">
                Sjálfvirk og einföld stofnun herferða án þess að þurfa dýra milliliði eða flókin
                auglýsingakerfi.
              </p>
            </div>

            {/* Core Features Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              {/* Feature 1 */}
              <div className="p-8 rounded-3xl bg-white border border-slate-200/80 shadow-xs hover:shadow-md transition-all duration-300 flex flex-col justify-between space-y-6">
                <div className="w-12 h-12 rounded-2xl bg-blue-50 flex items-center justify-center text-blue-600">
                  <span className="material-symbols-outlined text-2xl font-bold">my_location</span>
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-900 mb-2">
                    Samhengismiðuð miðlun (Contextual targeting)
                  </h3>
                  <p className="text-sm text-slate-500 leading-relaxed">
                    Settu auglýsingar þínar þar sem lesendur eru þegar að skoða skylt efni. Veldu
                    vefsvæði út frá flokkum (t.d. fjármál, lífsstíll, íþróttir) og landfræðilegu
                    svæði (Höfuðborgarsvæðið / Landsbyggðin) án þess að treysta á skaðlegar
                    vafrakökur.
                  </p>
                </div>
              </div>

              {/* Feature 2 */}
              <div className="p-8 rounded-3xl bg-white border border-slate-200/80 shadow-xs hover:shadow-md transition-all duration-300 flex flex-col justify-between space-y-6">
                <div className="w-12 h-12 rounded-2xl bg-blue-50 flex items-center justify-center text-blue-600">
                  <span className="material-symbols-outlined text-2xl font-bold">shield</span>
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-900 mb-2">
                    Fullt vörumerkjaöryggi (Brand Safety)
                  </h3>
                  <p className="text-sm text-slate-500 leading-relaxed">
                    Kerfið framkvæmir sjálfvirka skönnun á öllu skapandi efni (nsfw/ofbeldi) við
                    upphleðslu og fer í gegnum handvirkt samþykkisferli hjá kerfisstjórum.
                    Auglýsingarnar þínar birtast eingöngu á viðurkenndum og gæðamældum
                    samstarfsvefjum.
                  </p>
                </div>
              </div>

              {/* Feature 3 */}
              <div className="p-8 rounded-3xl bg-white border border-slate-200/80 shadow-xs hover:shadow-md transition-all duration-300 flex flex-col justify-between space-y-6">
                <div className="w-12 h-12 rounded-2xl bg-blue-50 flex items-center justify-center text-blue-600">
                  <span className="material-symbols-outlined text-2xl font-bold">
                    account_balance_wallet
                  </span>
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-900 mb-2">
                    Gagnsætt inneignarveski & VSK þjónustureikningar
                  </h3>
                  <p className="text-sm text-slate-500 leading-relaxed">
                    Þú leggur inn á reikninginn þinn með kreditkorti í gegnum örugga greiðslugátt
                    Teya. Innlögnin er VSK-frjáls og bætist óskert við veskið. Birtingur reiknar og
                    innheimtir 24% VSK eingöngu af 20% þjónustuþóknun okkar samfara birtingu
                    auglýsinga.
                  </p>
                </div>
              </div>

              {/* Feature 4 */}
              <div className="p-8 rounded-3xl bg-white border border-slate-200/80 shadow-xs hover:shadow-md transition-all duration-300 flex flex-col justify-between space-y-6">
                <div className="w-12 h-12 rounded-2xl bg-blue-50 flex items-center justify-center text-blue-600">
                  <span className="material-symbols-outlined text-2xl font-bold">monitoring</span>
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-900 mb-2">
                    Mælingar í rauntíma (Real-time telemetry)
                  </h3>
                  <p className="text-sm text-slate-500 leading-relaxed">
                    Fylgstu með birtingum, smellum og smellihlutfalli (CTR) í stjórnborðinu þínu.
                    Kerfið tryggir sjálfvirka reconciliation þannig að herferðir séu paused
                    samstundis þegar áætlaðri inneign er náð, sem kemur í veg fyrir yfirkeyrslu á
                    fjárhagsáætlun.
                  </p>
                </div>
              </div>
            </div>

            {/* Campaign Wizard Steps & VSK Card */}
            <div className="pt-8 border-t border-slate-200">
              <h2 className="text-2xl font-extrabold text-slate-900 mb-10 text-center">
                Hvernig fer ferlið fram?
              </h2>

              <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
                <div className="lg:col-span-6 space-y-8">
                  <div className="flex gap-4">
                    <div className="w-10 h-10 rounded-full bg-blue-600 flex items-center justify-center font-bold text-white shrink-0 shadow-lg shadow-blue-500/20">
                      1
                    </div>
                    <div>
                      <h3 className="text-lg font-bold text-slate-900 mb-1">Stofnaðu aðgang</h3>
                      <p className="text-sm text-slate-500 leading-relaxed">
                        Skráðu fyrirtækið inn með Google eða netfangi. Þú færð samstundis aðgang að
                        auglýsingastjórnborðinu án þess að bíða eftir samþykki.
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-4">
                    <div className="w-10 h-10 rounded-full bg-blue-600 flex items-center justify-center font-bold text-white shrink-0 shadow-lg shadow-blue-500/20">
                      2
                    </div>
                    <div>
                      <h3 className="text-lg font-bold text-slate-900 mb-1">
                        Hladdu upp skapandi efni (Creatives)
                      </h3>
                      <p className="text-sm text-slate-500 leading-relaxed">
                        Settu inn myndir, fyrirsagnir og lendingarsíðu (URL) fyrir auglýsinguna
                        þína. Vefurinn þinn sér sjálfkrafa um að stilla stærðir.
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-4">
                    <div className="w-10 h-10 rounded-full bg-blue-600 flex items-center justify-center font-bold text-white shrink-0 shadow-lg shadow-blue-500/20">
                      3
                    </div>
                    <div>
                      <h3 className="text-lg font-bold text-slate-900 mb-1">
                        Leggðu inn inneign og virkjaðu
                      </h3>
                      <p className="text-sm text-slate-500 leading-relaxed">
                        Veldu fjárhæð, borgaðu með kreditkorti og herferðin þín fer sjálfkrafa í
                        loftið á samstarfsnetinu okkar.
                      </p>
                    </div>
                  </div>
                </div>

                {/* VSK Card calculation (Auditor Compliant) */}
                <div className="lg:col-span-6 p-6 sm:p-8 rounded-3xl bg-white border border-slate-200/80 shadow-md">
                  <h3 className="text-lg font-bold text-slate-900 mb-4 flex items-center gap-2">
                    <span className="material-symbols-outlined text-blue-600">receipt_long</span>
                    Greiðslufyrirkomulag og VSK
                  </h3>
                  <p className="text-sm text-slate-600 leading-relaxed mb-6">
                    Inneignir eru keyptar fyrirfram með kreditkorti í gegnum örugga greiðslugátt
                    **Teya**. Innlögnin sjálf er VSK-frjáls innlögn á veltureikning og fer 100%
                    óskert í inneignarveskið þitt. Rafrænn VSK-reikningur er eingöngu gefinn út
                    fyrir umsýsluþóknun Birtings (20% af eyðslu) jafnóðum og auglýsingar eru sýndar.
                  </p>

                  {/* calculation example */}
                  <div className="space-y-3 bg-slate-50 p-4 rounded-2xl border border-slate-200 text-xs font-mono mb-4">
                    <div className="flex justify-between">
                      <span className="text-slate-500">Innlögn á veltureikning (VSK-frítt):</span>
                      <span className="text-slate-800">20.000 kr.</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Inneign í veski til ráðstöfunar:</span>
                      <span className="text-blue-600 font-bold">20.000 kr.</span>
                    </div>
                    <div className="flex flex-col border-t border-slate-200 pt-2 gap-1">
                      <span className="text-[10px] text-slate-400 font-sans font-semibold">
                        Áætlaður VSK við birtingu (reiknað af 20% þóknun Birtings):
                      </span>
                      <div className="flex justify-between">
                        <span className="text-slate-550">- Áætluð þóknun (20%):</span>
                        <span className="text-slate-800">4.000 kr.</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-550">- Áætlaður VSK (24% af þóknun):</span>
                        <span className="text-slate-800">960 kr.</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 text-[10px] text-slate-500">
                    <span className="material-symbols-outlined text-xs">info</span>
                    Birtingur ehf. (Kt. 560126-1020) VSK nr: 148902
                  </div>
                </div>
              </div>
            </div>

            {/* CTA Section */}
            <div className="p-8 sm:p-12 rounded-3xl bg-linear-to-r from-blue-50/80 to-indigo-50/80 border border-blue-100/80 text-center space-y-6 shadow-xs">
              <h3 className="text-2xl font-extrabold text-slate-900">Ertu tilbúinn að auglýsa?</h3>
              <p className="text-slate-600 text-sm sm:text-base max-w-xl mx-auto font-medium">
                Skráðu fyrirtækið þitt inn í dag, settu upp fyrstu auglýsinguna á nokkrum mínútum og
                byrjaðu að ná árangri.
              </p>
              <button
                onClick={() => navigate('/sign-in')}
                className="px-8 py-4 rounded-2xl bg-blue-600 hover:bg-blue-500 text-white font-extrabold text-base shadow-xl shadow-blue-500/25 transition-all cursor-pointer inline-flex items-center gap-2"
              >
                Hefja herferð núna <span className="material-symbols-outlined">campaign</span>
              </button>
            </div>
          </div>
        )}

        {/* TAB: FOR PUBLISHERS */}
        {currentTab === 'publishers' && (
          <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-16 md:py-20 space-y-20">
            {/* Header */}
            <div className="space-y-4 text-center">
              <span className="text-xs font-bold uppercase tracking-wider text-blue-600 bg-blue-50 px-3 py-1 rounded-full border border-blue-100">
                Veftekjur
              </span>
              <h1 className="text-4xl sm:text-5xl font-black text-slate-900 leading-tight">
                Hámarkaðu tekjur vefsins þíns
              </h1>
              <p className="text-base sm:text-lg text-slate-500 max-w-2xl mx-auto font-medium">
                Taktu á móti sjálfvirkum auglýsingum án þess að tapa stjórn á því hvaða efni birtist
                lesendum þínum.
              </p>
            </div>

            {/* Core Features Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              {/* Feature 1 */}
              <div className="p-8 rounded-3xl bg-white border border-slate-200/80 shadow-xs hover:shadow-md transition-all duration-300 flex flex-col justify-between space-y-6">
                <div className="w-12 h-12 rounded-2xl bg-blue-50 flex items-center justify-center text-blue-600">
                  <span className="material-symbols-outlined text-2xl font-bold">checklist</span>
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-900 mb-2">
                    Gæðamat (Manual approvals queue)
                  </h3>
                  <p className="text-sm text-slate-500 leading-relaxed">
                    Engin auglýsing fer í loftið á þínu vefsvæði án þess að þú (eða starfsfólk þitt)
                    samþykki hana í stjórnborðinu þínu. Þú hefur fullt ritstjórnarlegt frelsi til að
                    hafna auglýsingum sem henta ekki þínum lesendum og vernda þannig orðspor
                    vefsins.
                  </p>
                </div>
              </div>

              {/* Feature 2 */}
              <div className="p-8 rounded-3xl bg-white border border-slate-200/80 shadow-xs hover:shadow-md transition-all duration-300 flex flex-col justify-between space-y-6">
                <div className="w-12 h-12 rounded-2xl bg-blue-50 flex items-center justify-center text-blue-600">
                  <span className="material-symbols-outlined text-2xl font-bold">code</span>
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-900 mb-2">
                    Auðveld og hraðvirk uppsetning
                  </h3>
                  <p className="text-sm text-slate-500 leading-relaxed">
                    Þú þarft aðeins að afrita einnar línu HTML-kóða inn á vefsíðuna þína til að
                    virkja kerfið. Skriftan okkar (widget.js) er undir 5KB að stærð, keyrir
                    ósamstillt (async) og hefur engin áhrif á leitarvélabestun (SEO) eða
                    frammistöðu.
                  </p>
                </div>
              </div>

              {/* Feature 3 */}
              <div className="p-8 rounded-3xl bg-white border border-slate-200/80 shadow-xs hover:shadow-md transition-all duration-300 flex flex-col justify-between space-y-6">
                <div className="w-12 h-12 rounded-2xl bg-blue-50 flex items-center justify-center text-blue-600">
                  <span className="material-symbols-outlined text-2xl font-bold">payments</span>
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-900 mb-2">Mánaðarleg uppgjör</h3>
                  <p className="text-sm text-slate-500 leading-relaxed">
                    Við gerum upp áunnar auglýsingatekjur mánaðarlega og leggjum þær beint inn á
                    bankareikninginn þinn fyrsta virka dag hvers mánaðar ef lágmarki er náð.
                    Lágmarksútborgun er 5.000 kr. (Nettó).
                  </p>
                </div>
              </div>

              {/* Feature 4 */}
              <div className="p-8 rounded-3xl bg-white border border-slate-200/80 shadow-xs hover:shadow-md transition-all duration-300 flex flex-col justify-between space-y-6">
                <div className="w-12 h-12 rounded-2xl bg-blue-50 flex items-center justify-center text-blue-600">
                  <span className="material-symbols-outlined text-2xl font-bold">tune</span>
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-900 mb-2">
                    Greiðsluleiðir að þínu vali
                  </h3>
                  <p className="text-sm text-slate-500 leading-relaxed">
                    Þú getur valið á milli þess að nota okkar flata 550 kr. CPM verð (greitt fyrir
                    sýningar) eða leigt út plássið á föstu leiguverði yfir ákveðinn fjölda daga sem
                    þú ákveður sjálfur.
                  </p>
                </div>
              </div>
            </div>

            {/* Technical Snippet Showcase */}
            <div className="pt-8 border-t border-slate-200">
              <h2 className="text-2xl font-extrabold text-slate-900 mb-10 text-center">
                Einfaldleiki í verki
              </h2>
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
                <div className="lg:col-span-7 space-y-6">
                  <h3 className="text-xl font-bold text-slate-900">
                    Engin flókin kerfi, aðeins ein lína
                  </h3>
                  <p className="text-sm text-slate-500 leading-relaxed">
                    Gleymdu þungum plugins og flóknum samþættingum. Kerfið okkar notar öruggt
                    Javascript og létta HTML tags sem tryggir að vefurinn þinn verður áfram
                    eldsnöggur.
                  </p>
                  <ul className="space-y-3 text-sm text-slate-600">
                    <li className="flex items-center gap-2">
                      <span className="material-symbols-outlined text-blue-600 text-sm font-bold">
                        done
                      </span>
                      Einstaklega létt skrifta (&lt;5KB) og lágmarkskröfur á kerfi
                    </li>
                    <li className="flex items-center gap-2">
                      <span className="material-symbols-outlined text-blue-600 text-sm font-bold">
                        done
                      </span>
                      Asynchronous hleðsla (async) tefur aldrei aðra vefhluta
                    </li>
                    <li className="flex items-center gap-2">
                      <span className="material-symbols-outlined text-blue-600 text-sm font-bold">
                        done
                      </span>
                      Fellur út sjálfkrafa (fail-silent) ef sambandsleysi verður
                    </li>
                    <li className="flex items-center gap-2">
                      <span className="material-symbols-outlined text-blue-600 text-sm font-bold">
                        done
                      </span>
                      Hönnuð samkvæmt Core Web Vitals til að koma í veg fyrir Layout Shifts
                    </li>
                  </ul>
                </div>

                <div className="lg:col-span-5 rounded-xl bg-slate-950 border border-slate-900 overflow-hidden shadow-lg font-mono text-xs">
                  <div className="px-4 py-2 border-b border-slate-900 flex items-center justify-between">
                    <span className="text-[10px] font-bold text-slate-400">Uppsetningarkóði</span>
                    <span className="text-[9px] text-slate-500">CDN CDN.BIRTINGUR.APP</span>
                  </div>
                  <div className="p-4 text-blue-400 leading-relaxed overflow-x-auto select-all">
                    <code>
                      {`<!-- Snippet til að birta plássið -->\n`}
                      {`<div data-adplatform-slot="slot_id">\n`}
                      {`</div>\n\n`}
                      {`<!-- Keyrir ósamstillt í head eða body -->\n`}
                      {`<script async src="https://cdn.birtingur.app/widget.js">\n`}
                      {`</script>`}
                    </code>
                  </div>
                </div>
              </div>
            </div>

            {/* Payout & Terms Summary */}
            <div className="p-6 sm:p-8 rounded-3xl bg-white border border-slate-200/80 shadow-md space-y-4">
              <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                <span className="material-symbols-outlined text-blue-600">info</span>
                Útgreiðsluskilmálar og platform þóknun
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8 text-sm text-slate-600 leading-relaxed">
                <p>
                  Kerfið tekur **20% flatgreidda þóknun** (Platform Fee) af öllum auglýsingatekjum
                  sem miðlað er á vefinn þinn. Þessi þóknun stendur straum af rekstri netþjóna,
                  greiðslugáttum, sjálfvirkri nsfw modereringu og umsýslu. Engin önnur gjöld eiga
                  við.
                </p>
                <p>
                  Tekjur þínar safnast upp í rauntíma á fjárhagsbók (ledger) stjórnborðsins. Ef
                  inneign þín nær **5.000 kr.** er hún greidd út á skráðan bankareikning fyrsta
                  virka dag hvers mánaðar. Safnist minni upphæð flyst hún óskert yfir á næsta mánuð.
                </p>
              </div>
            </div>

            {/* CTA Section */}
            <div className="p-8 sm:p-12 rounded-3xl bg-linear-to-r from-blue-50/80 to-indigo-50/80 border border-blue-100/80 text-center space-y-6 shadow-xs">
              <h3 className="text-2xl font-extrabold text-slate-900">
                Byrjaðu að safna tekjum í dag
              </h3>
              <p className="text-slate-600 text-sm sm:text-base max-w-xl mx-auto font-medium">
                Skráðu þig sem útgefanda, búðu til fyrsta auglýsingaplássið þitt og byrjaðu að
                samþykkja auglýsingar.
              </p>
              <button
                onClick={() => navigate('/sign-in')}
                className="px-8 py-4 rounded-2xl bg-blue-600 hover:bg-blue-500 text-white font-extrabold text-base shadow-xl shadow-blue-500/25 transition-all cursor-pointer inline-flex items-center gap-2"
              >
                Hefja sölu á auglýsingaplássi{' '}
                <span className="material-symbols-outlined text-lg">add_to_queue</span>
              </button>
            </div>
          </div>
        )}

        {/* TAB: FAQ */}
        {currentTab === 'faq' && (
          <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-16 md:py-20 space-y-12">
            <div className="space-y-4 text-center">
              <h1 className="text-4xl font-extrabold text-slate-900">Algengar spurningar</h1>
              <p className="text-lg text-slate-500">
                Fljótleg svör við tæknilegum og viðskiptalegum atriðum.
              </p>
            </div>

            <div className="space-y-4">
              {[
                {
                  q: 'Hvernig set ég upp auglýsingar á vefsíðuna mína?',
                  a: 'Eftir að þú skráir þig som útgefanda færðu úthlutað sérstöku script-taggi (<script async src="https://cdn.birtingur.app/widget.js"></script>) sem þú setur inn í <head> eða undir lok <body> á síðunni þinni. Svo setur þú inn <div> með viðeigandi data-pláss auðkenni á þá staði þar sem þú vilt að auglýsingar birtist.',
                },
                {
                  q: 'Hvernig borga ég fyrir herferðir og hver er lágmarksgreiðsla?',
                  a: 'Greiðslur fara fram með kreditkorti í gegnum örugga greiðslugátt Teya. Lágmarksupphæð hverrar innborgunar er 2.000 kr. Innlögnin sjálf er VSK-frí og bætist 100% við inneign þína. Við hverja innborgun færðu staðfestingarkvittun, og löglegan VSK-reikning eingöngu af 20% umsýsluþóknun okkar jafnóðum og herferðin er birt.',
                },
                {
                  q: 'Hvað tekur Birtingur háa þóknun af sölu?',
                  a: 'Birtingur tekur 20% þóknun af heildar auglýsingagreiðslum sem fara í gegnum kerfið til að standa straum af hýsingu, greiðsluþóknunum og rekstri kerfisins. Engin mánaðarleg fastagjöld eða stofngjöld eru tekin af notendum.',
                },
                {
                  q: 'Þarf ég að breyta vafrakökustefnu (Cookie policy) hjá mér?',
                  a: 'Nei, almennt ekki. Kerfið okkar er hannað án persónugreinanlegra vafrakaka (e. tracking cookies) til vefsporunar. Auglýsingamiðlun okkar byggist á samhengi þess efnis sem lesandinn skoðar (e. Contextual Advertising) og almennum upplýsingum (t.d. landsvæði út frá IP-tölu) sem telst fullkomlega GDPR-samhæft án þess að krefjast sérstaks samþykkis fyrir vafrakökum.',
                },
                {
                  q: 'Hvenær fara útborganir til útgefenda fram og hver er lágmarksupphæð?',
                  a: 'Útborganir til útgefenda eru framkvæmdar fyrsta virka dag hvers mánaðar. Lágmarksútborgun er 5.000 kr. Safnist minni upphæð á einum mánuði flyst hún yfir á þann næsta og greiðist út þegar lágmarkinu er náð.',
                },
                {
                  q: 'Eruð þið með API aðgang fyrir auglýsingastofur eða sjálfvirk kerfi?',
                  a: 'Já, kerfið er hannað sem „API-first“ vettvangur. Auglýsingastofur og stórnotendur geta stofnað langtíma API-lykla (ak_...) í stjórnborðinu sínu til að samþætta eigin kerfi, hlaða upp efni eða sækja tölfræði. Einnig bjóðum við upp á fullbúinn MCP (Model Context Protocol) netþjón sem leyfir gervigreindarkeyrðum umboðsmönnum (AI Agents) að stýra herferðum beint.',
                },
                {
                  q: 'Get ég notað sömu skráningu til að vera bæði auglýsandi og útgefandi?',
                  a: 'Já, þú getur hæglega verið með bæði auglýsinga- og útgefendahlutverk á sama notendareikningi. Í stjórnborðinu geturðu flakkað á milli þess að stýra herferðum eða stjórna auglýsingaplássum á þínum eigin vefsíðum.',
                },
                {
                  q: 'Hvað gerist ef auglýsingu er hafnað eða herferð er stöðvuð?',
                  a: 'Ef auglýsingu er hafnað í gæðaeftirliti eða herferð er stöðvuð af einhverjum ástæðum, þá er ónotuð herferðarinnskráning endurgreidd samstundis í inneignarveskið þitt. Þannig taparðu aldrei krónu ef eitthvað kemur upp á.',
                },
                {
                  q: 'Hvernig er smellamælingum varist gegn svikum (Click Fraud)?',
                  a: 'Við notum öfluga síun á netþjónastigi sem greinir tvísmelli, bot-umferð og óeðlilega smellitíðni. Sviksamlegir smellir eru sjálfkrafa hreinsaðir út úr mælingunum áður en tölfræðin er uppfærð og þeir eru aldrei dregnir frá inneign auglýsenda.',
                },
                {
                  q: 'Hvaða kröfur eru gerðar til stærðar og sniðs auglýsingamynda?',
                  a: 'Kerfið styður algengustu myndasnið eins og PNG, JPEG og WebP. Hámarksstærð er 1MB á hverja mynd til að tryggja hraðhleðslu. Kerfið styður hefðbundnar IAB stærðir: 300x250 (hliðarborði), 728x90 (leiðari) og 970x250 (risaborði).',
                },
              ].map((faq, index) => (
                <div
                  key={index}
                  className="rounded-2xl bg-white border border-slate-200/80 shadow-xs overflow-hidden transition-all duration-200"
                >
                  <button
                    onClick={() => toggleFaq(index)}
                    className="w-full px-6 py-5 flex items-center justify-between text-left font-bold text-slate-850 hover:bg-slate-50 cursor-pointer"
                  >
                    <span>{faq.q}</span>
                    <span className="material-symbols-outlined text-slate-500 select-none">
                      {openFaqIndex === index ? 'expand_less' : 'expand_more'}
                    </span>
                  </button>
                  {openFaqIndex === index && (
                    <div className="px-6 pb-5 pt-1 text-sm text-slate-650 leading-relaxed border-t border-slate-100">
                      {faq.a}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {currentTab === 'terms' && (
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-16 md:py-20 space-y-12">
            <div className="space-y-4 text-center">
              <h1 className="text-4xl font-extrabold text-slate-900">Skilmálar og Persónuvernd</h1>
              <p className="text-lg text-slate-500 font-medium">
                Notendaskilmálar og stefna um meðferð persónuupplýsinga hjá Birtingi
                (birtingur.app).
              </p>
            </div>

            <div className="bg-white border border-slate-200/80 rounded-3xl p-8 sm:p-10 shadow-xs space-y-8 text-slate-650 leading-relaxed text-sm">
              <section className="space-y-3">
                <h2 className="text-xl font-bold text-slate-900 border-b border-slate-100 pb-2">
                  1. Almenn ákvæði
                </h2>
                <p>
                  Vefurinn **birtingur.app** (hér eftir „Birtingur“ eða „Vettvangurinn“) er rekinn
                  af **Nútímalegri auglýsingamiðlun ehf.**, kt. 560126-1020, Laugavegi 182, 105
                  Reykjavík (hér eftir „Félagið“). Birtingur er sjálfvirkur
                  sjálfsafgreiðsluvettvangur sem tengir saman útgefendur vefsvæða og auglýsendur á
                  Íslandi.
                </p>
                <p>
                  Skilmálar þessir gilda um öll viðskipti og notkun á þjónustu Birtings, hvort sem
                  um ræðir kaup á auglýsingaplássi (auglýsendur) eða sölu á birtingum (útgefendur).
                  Með því að stofna aðgang samþykkja notendur skilmála þessa í heild sinni.
                </p>
              </section>

              <section className="space-y-3">
                <h2 className="text-xl font-bold text-slate-900 border-b border-slate-100 pb-2">
                  2. Skilmálar fyrir auglýsendur (Kaupendur)
                </h2>
                <p>
                  **Innborgun og Wallet**: Birtingur notar fyrirframgreitt inneignarkerfi (Wallet).
                  Auglýsendur leggja inn inneign með kreditkorti í gegnum örugga greiðslugátt
                  **Teya**. Lágmarksinnborgun er 2.000 kr. Innlögnin er VSK-frjáls innlögn á
                  veltureikning og bætist 100% við inneign þína. Við innborgun færðu senda kvittun
                  fyrir innlögninni. Lögbundinn sölureikningur með 24% virðisaukaskatti (VSK) er
                  gefinn út fyrir 20% umsýsluþóknun Birtings jafnóðum og herferðir eru birtar.
                  Inneignir fyrnast ekki en eru almennt ekki endurgreiddar nema herferðir séu
                  stöðvaðar af hálfu kerfisins.
                </p>
                <p>
                  **Auglýsingaefni (Creatives)**: Auglýsendur bera fulla ábyrgð á því efni sem þeir
                  hlaða upp í kerfið. Öllum auglýsingum er skannað sjálfvirkt fyrir óviðeigandi efni
                  (t.d. nekt, ofbeldi) og þær þurfa samþykki kerfisstjóra áður en þær fara í
                  birtingu. Ólöglegt efni, hatursáróður eða efni sem brýtur gegn höfundarrétti er
                  stranglega bannað.
                </p>
                <p>
                  **Birtingar og kostnaður**: Kostnaður er dreginn af inneign notanda í rauntíma
                  samkvæmt CPM (kostnaður per 1.000 sýningar) eða samkvæmt föstu verði plássa.
                  Kerfið stöðvar herferð sjálfkrafa um leið og inneign hennar tæmist.
                </p>
              </section>

              <section className="space-y-3">
                <h2 className="text-xl font-bold text-slate-900 border-b border-slate-100 pb-2">
                  3. Skilmálar fyrir útgefendur (Söluaðila)
                </h2>
                <p>
                  **Uppsetning og rekstur**: Útgefandi setur inn létta Javascript skriftu
                  (widget.js) á sitt vefsvæði til að birta auglýsingar. Skriftan vinnur ósamstillt
                  (async) og fellur út hljóðlaust ef villa kemur upp, án þess að tefja eða skemma
                  fyrir vefnum.
                </p>
                <p>
                  **Ritstjórnarlegt frelsi**: Útgefandi getur virkjað handvirka samþykkisbiðröð
                  (Approvals Queue) í sínu stjórnborði. Þannig er hægt að skoða og samþykkja eða
                  hafna öllum auglýsingaborðum áður en þeir birtast á vefnum.
                </p>
                <p>
                  **Þóknun og greiðslur**: Birtingur tekur **20% flatgreidda þóknun** af öllum
                  auglýsingatekjum sem miðlast í gegnum kerfið. Þóknunin stendur straum af rekstri,
                  greiðslugáttum og umsýslu. Tekjur útgefanda safnast upp í rauntíma. Ef áunnin
                  inneign nær **5.000 kr.** nettó greiðist hún út á skráðan bankareikning fyrsta
                  virka dag næsta mánaðar. Útgefandi ber ábyrgð á því að banka- og
                  reikningsupplýsingar séu réttar.
                </p>
              </section>

              <section className="space-y-3">
                <h2 className="text-xl font-bold text-slate-900 border-b border-slate-100 pb-2">
                  4. Persónuverndarstefna (GDPR)
                </h2>
                <p>
                  Birtingur leggur mikla áherslu á persónuvernd og lágmarkar söfnun gagna. Kerfið
                  safnar **ekki persónugreinanlegum vafrakökum** (tracking cookies) til að fylgjast
                  með notendum á milli vefsvæða.
                </p>
                <p>
                  **Gagnaúrvinnsla**: Auglýsingamiðlun okkar er samhengismiðuð (Contextual
                  Targeting) og byggist á flokkun vefefnis og grófri staðsetningu (landfræðilegt
                  svæði greint út frá IP-tölu á netþjónsstigi). IP-tölur eru aldrei vistaðar í
                  gagnagrunni okkar heldur eru þær eingöngu notaðar í rauntíma til að ákvarða
                  birtingarsvæði og koma í veg fyrir smellasvik (Click Fraud). Birtingur telst því
                  vera vinnsluaðili (Processor) gagna en útgefandi telst ábyrgðaraðili (Controller)
                  gagnvart sínum lesendum.
                </p>
              </section>

              <section className="space-y-3">
                <h2 className="text-xl font-bold text-slate-900 border-b border-slate-100 pb-2">
                  5. Takmörkun ábyrgðar
                </h2>
                <p>
                  Birtingur ehf. ábyrgist ekki 100% samfellda keyrslu eða algjört villuleysi í
                  kerfinu. Þjónustan er afhent „eins og hún er“. Félagið ber enga ábyrgð á óbeinu
                  tjóni, glötuðum tekjum útgefenda, eða rekstrartjóni auglýsenda vegna bilana eða
                  tafa á birtingum.
                </p>
              </section>

              <section className="space-y-3">
                <h2 className="text-xl font-bold text-slate-900 border-b border-slate-100 pb-2">
                  6. Gildissvið og varnarþing
                </h2>
                <p>
                  Skilmálar þessir eru háðir íslenskum lögum. Rísi ágreiningur vegna þeirra eða
                  notkunar á vettvangnum skal málinu vísað til Héraðsdóms Reykjavíkur.
                </p>
                <p className="text-xs text-slate-400 pt-4">
                  Síðast uppfært: 3. júní 2026. Birtingur ehf. áskilur sér rétt til að uppfæra
                  skilmála þessa reglulega.
                </p>
              </section>
            </div>
          </div>
        )}
      </main>

      {/* FOOTER */}
      <footer className="bg-white border-t border-slate-200/80 py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
            {/* Logo/Info */}
            <div className="space-y-4">
              <div
                className="flex items-center gap-2 cursor-pointer"
                onClick={() => changeTab('home')}
              >
                <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center font-extrabold text-sm text-white shadow-md shadow-blue-500/20">
                  B
                </div>
                <span className="font-extrabold text-lg text-slate-850">Birtingur</span>
              </div>
              <p className="text-xs text-slate-550 leading-relaxed">
                Nútímaleg auglýsingamiðlun ehf.
                <br />
                Kt. 560126-1020 | VSK nr. 148902
                <br />
                Laugavegur 182, 105 Reykjavík
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
                    onClick={() => changeTab('advertisers')}
                    className="text-slate-500 hover:text-slate-850 transition cursor-pointer"
                  >
                    Stofna herferð
                  </button>
                </li>
                <li>
                  <button
                    onClick={() => changeTab('advertisers')}
                    className="text-slate-500 hover:text-slate-850 transition cursor-pointer"
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
                    onClick={() => changeTab('publishers')}
                    className="text-slate-500 hover:text-slate-850 transition cursor-pointer"
                  >
                    Sækja kóða
                  </button>
                </li>
                <li>
                  <button
                    onClick={() => changeTab('publishers')}
                    className="text-slate-500 hover:text-slate-850 transition cursor-pointer"
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
                    className="text-slate-500 hover:text-slate-850 transition"
                  >
                    info@birtingur.app
                  </a>
                </li>
                <li>Hjálparmiðstöð & FAQ</li>
              </ul>
            </div>
          </div>

          <div className="pt-8 border-t border-slate-100 mt-8 flex flex-col sm:flex-row items-center justify-between gap-4">
            <span className="text-[10px] text-slate-500">
              © 2026 Birtingur (birtingur.app) – Nútímaleg auglýsingamiðlun. Allur réttur áskilinn.
            </span>
            <div className="flex gap-4 text-[10px] text-slate-550">
              <button
                onClick={() => changeTab('terms')}
                className="hover:text-slate-800 transition cursor-pointer bg-transparent border-0 p-0 font-normal"
              >
                Notendaskilmálar
              </button>
              <button
                onClick={() => changeTab('terms')}
                className="hover:text-slate-800 transition cursor-pointer bg-transparent border-0 p-0 font-normal"
              >
                Persónuverndarstefna
              </button>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
