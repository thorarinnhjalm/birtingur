import { useState, type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { Sidebar, type SidebarItem } from './Sidebar';
import { TopBar } from './TopBar';
import { apiFetch } from '@/lib/api';

const FAQS = [
  {
    q: 'Hvernig virka flokkatengd netkaup?',
    a: 'Auglýsendur velja þá efnisflokka sem lýsa markhópnum best (t.d. Tækni, Íþróttir, Matur) í stað þess að velja stök pláss. Kerfið birtir auglýsingarnar sjálfkrafa á öllum viðeigandi plássum útgefenda í þeim flokkum.',
  },
  {
    q: 'Hvert er verðlagið á birtingum?',
    a: 'Birtingur styðst við fast verðlag upp á 550 kr. CPM (fyrir hverjar 1000 birtingar) fyrir allar herferðir og pláss á vettvangnum. Þetta tryggir gagnsæi og einfaldleika í reikningum.',
  },
  {
    q: 'Hvernig virka greiðslur og veskið?',
    a: 'Auglýsendur geta sett inn inneign í veskið sitt með greiðslukorti í gegnum örugga Teya-greiðslugátt. Útgefendur safna tekjum og fá greitt mánaðarlega inn á bankareikning þegar inneignin nær 10.000 kr.',
  },
  {
    q: 'Hvernig eru auglýsingar samþykktar?',
    a: 'Allt auglýsingaefni (creatives) fer í gegnum sjálfvirka gervigreindargreiningu við upphleðslu. Herferðir virkjast sjálfkrafa þegar efnið er samþykkt og herferðin á virka áætlun.',
  },
];

export function AppShell({
  items,
  children,
  title,
}: {
  items: SidebarItem[];
  children: ReactNode;
  title?: string;
}) {
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const [isHelpOpen, setIsHelpOpen] = useState(false);
  const [showContactForm, setShowContactForm] = useState(false);
  const [contactSubject, setContactSubject] = useState('');
  const [contactBody, setContactBody] = useState('');
  const [contactSending, setContactSending] = useState(false);
  const [contactSent, setContactSent] = useState(false);

  const location = useLocation();
  const isAdvertiser = location.pathname.startsWith('/advertiser');
  const isPublisher = location.pathname.startsWith('/publisher');

  const handleContactSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!contactSubject.trim() || !contactBody.trim()) return;
    setContactSending(true);
    try {
      await apiFetch('/v1/support/messages', {
        method: 'POST',
        body: JSON.stringify({
          subject: contactSubject,
          body: contactBody,
          role: isAdvertiser ? 'advertiser' : isPublisher ? 'publisher' : 'unknown',
        }),
      });
      setContactSent(true);
      setContactSubject('');
      setContactBody('');
    } catch {
      // Ignore — user can retry
    } finally {
      setContactSending(false);
    }
  };

  return (
    <div className="min-h-screen flex bg-background font-sans antialiased text-on-background">
      <Sidebar
        items={items}
        title={title}
        isOpen={isMobileOpen}
        onClose={() => setIsMobileOpen(false)}
        onHelpClick={() => {
          setIsHelpOpen(true);
          setShowContactForm(false);
          setContactSent(false);
        }}
      />
      <div className="flex-1 flex flex-col min-w-0 pl-0 md:pl-[280px]">
        <TopBar onMenuClick={() => setIsMobileOpen(true)} />
        <main className="flex-1 p-4 md:p-margin-desktop space-y-gutter max-w-7xl w-full mx-auto flex flex-col justify-between">
          <div className="flex-1">{children}</div>
          {/* Help link — triggers contact/help modal */}
          <div className="text-center py-4 mt-8">
            <button
              onClick={() => {
                setIsHelpOpen(true);
                setShowContactForm(true);
                setContactSent(false);
              }}
              className="text-secondary text-label-md font-semibold hover:text-primary transition-colors inline-flex items-center gap-2 cursor-pointer bg-transparent border-none"
            >
              <span className="material-symbols-outlined text-sm">mail</span>
              Þarftu aðstoð? Hafðu samband við okkur
            </button>
          </div>
        </main>
      </div>

      {isHelpOpen && (
        <div className="fixed inset-0 z-100 flex items-center justify-center bg-slate-900/60 backdrop-blur-md animate-fadeIn">
          <div className="bg-white rounded-2xl border border-slate-100 shadow-2xl max-w-lg w-full p-6 animate-scaleIn mx-4 relative text-slate-800">
            <button
              onClick={() => setIsHelpOpen(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 transition-colors p-1.5 hover:bg-slate-50 rounded-lg cursor-pointer border-none bg-transparent"
            >
              <span className="material-symbols-outlined">close</span>
            </button>

            <div className="flex items-center gap-2.5 mb-6">
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
                <span className="material-symbols-outlined">help</span>
              </div>
              <div>
                <h3 className="text-lg font-bold text-slate-900 leading-tight">
                  Aðstoð & Algengar Spurningar
                </h3>
                <p className="text-xs text-slate-500">Hvernig getum við hjálpað þér í dag?</p>
              </div>
            </div>

            {!showContactForm ? (
              <>
                <div className="space-y-4 max-h-[360px] overflow-y-auto pr-1">
                  {FAQS.map((faq, idx) => (
                    <div
                      key={idx}
                      className="border-b border-slate-100 pb-3 last:border-0 last:pb-0"
                    >
                      <h4 className="font-bold text-sm text-slate-900 mb-1 flex items-start gap-2">
                        <span className="text-primary font-extrabold mt-0.5">•</span>
                        {faq.q}
                      </h4>
                      <p className="text-xs text-slate-600 leading-relaxed pl-3.5">{faq.a}</p>
                    </div>
                  ))}
                </div>

                <div className="mt-6 pt-5 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                  <div>
                    <h5 className="font-bold text-xs text-slate-900">Enn með spurningar?</h5>
                    <p className="text-[11px] text-slate-500">
                      Hafðu samband og við svörum fljótt.
                    </p>
                  </div>
                  <button
                    onClick={() => setShowContactForm(true)}
                    className="inline-flex items-center justify-center gap-2 bg-primary hover:opacity-95 text-white text-xs font-bold px-4 py-2.5 rounded-xl transition-all shadow-sm shadow-primary/10 cursor-pointer border-none"
                  >
                    <span className="material-symbols-outlined text-sm">chat</span>
                    Hafa samband
                  </button>
                </div>
              </>
            ) : contactSent ? (
              <div className="flex flex-col items-center justify-center py-10 text-center">
                <div className="w-14 h-14 rounded-full bg-emerald-50 flex items-center justify-center mb-4">
                  <span className="material-symbols-outlined text-emerald-600 text-2xl">
                    check_circle
                  </span>
                </div>
                <h4 className="text-lg font-bold text-slate-900 mb-1">Skilaboð móttekin!</h4>
                <p className="text-sm text-slate-500 max-w-xs">
                  Við munum svara eins fljótt og auðið er. Þakka þér fyrir.
                </p>
                <button
                  onClick={() => setIsHelpOpen(false)}
                  className="mt-6 bg-primary text-white px-6 py-2.5 rounded-xl text-xs font-bold hover:opacity-95 transition-all cursor-pointer border-none"
                >
                  Loka
                </button>
              </div>
            ) : (
              <form onSubmit={handleContactSubmit} className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">Efni</label>
                  <input
                    type="text"
                    value={contactSubject}
                    onChange={(e) => setContactSubject(e.target.value)}
                    placeholder="Hvað getum við aðstoðað þig með?"
                    required
                    className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">Skilaboð</label>
                  <textarea
                    value={contactBody}
                    onChange={(e) => setContactBody(e.target.value)}
                    placeholder="Lýstu vandanum eða spurningunni þinni..."
                    required
                    rows={4}
                    className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary resize-none"
                  />
                </div>
                <div className="flex gap-3 justify-end pt-2">
                  <button
                    type="button"
                    onClick={() => setShowContactForm(false)}
                    className="text-sm text-slate-500 hover:text-slate-700 font-semibold px-3 py-2 cursor-pointer border-none bg-transparent"
                  >
                    Til baka
                  </button>
                  <button
                    type="submit"
                    disabled={contactSending}
                    className="bg-primary text-white px-5 py-2.5 rounded-xl text-xs font-bold hover:opacity-95 transition-all shadow-sm shadow-primary/10 cursor-pointer disabled:opacity-50 flex items-center gap-2 border-none"
                  >
                    {contactSending ? (
                      <>
                        <span className="material-symbols-outlined text-sm animate-spin">
                          progress_activity
                        </span>
                        Sendi...
                      </>
                    ) : (
                      <>
                        <span className="material-symbols-outlined text-sm">send</span>
                        Senda skilaboð
                      </>
                    )}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
