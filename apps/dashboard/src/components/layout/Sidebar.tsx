import { useState, type ReactNode } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import clsx from 'clsx';

export interface SidebarItem {
  to: string;
  label: string;
  icon: string | ReactNode;
}

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
    a: 'Auglýsendur geta sett inn inneign í veskið sitt með greiðslukorti í gegnum örugga Teya-greiðslugátt. Útgefendur safna tekjum og fá greitt mánaðarlega inn á bankareikning þegar inneignin nær 5.000 kr.',
  },
  {
    q: 'Hvernig eru auglýsingar samþykktar?',
    a: 'Allt auglýsingaefni (creatives) fer í gegnum sjálfvirka gervigreindargreiningu við upphleðslu. Herferðir virkjast sjálfkrafa þegar efnið er samþykkt og herferðin á virka áætlun.',
  },
];

export function Sidebar({
  items,
  title = 'Auglýsingakerfi',
}: {
  items: SidebarItem[];
  title?: string;
}) {
  const location = useLocation();
  const navigate = useNavigate();
  const [isHelpOpen, setIsHelpOpen] = useState(false);

  const isAdvertiser = location.pathname.startsWith('/advertiser');
  const isPublisher = location.pathname.startsWith('/publisher');

  const handleActionClick = () => {
    if (isAdvertiser) {
      navigate('/advertiser/campaigns/new');
    } else if (isPublisher) {
      navigate('/publisher/slots/new');
    }
  };

  const actionButtonText = isAdvertiser ? 'Ný herferð' : isPublisher ? 'Nýtt pláss' : null;

  return (
    <aside className="bg-surface-container-low flex flex-col h-screen py-gutter px-4 w-[280px] fixed left-0 top-0 z-50 border-r border-outline-variant">
      <div className="mb-10 px-4">
        <h1 className="text-headline-md font-bold text-primary">{title}</h1>
        <p className="text-label-md text-on-secondary-fixed-variant opacity-70 mt-1">
          Íslensk markaðssetning
        </p>
      </div>

      {actionButtonText && (
        <button
          onClick={handleActionClick}
          className="mb-8 w-full bg-primary text-on-primary py-3 px-4 rounded-lg font-medium flex items-center justify-center gap-2 shadow-sm hover:opacity-90 transition-all active:scale-[0.98] cursor-pointer"
        >
          <span className="material-symbols-outlined">add</span>
          <span>{actionButtonText}</span>
        </button>
      )}

      <nav className="grow space-y-1">
        {items.map((it) => (
          <NavLink
            key={it.to}
            to={it.to}
            end={it.to === '/advertiser' || it.to === '/publisher' || it.to === '/admin'}
            className={({ isActive }) =>
              clsx(
                'flex items-center gap-3 px-4 py-3 rounded-lg transition-colors active:scale-[0.98]',
                isActive
                  ? 'bg-secondary-container text-primary font-bold border-l-2 border-primary'
                  : 'text-on-secondary-fixed-variant hover:bg-secondary-container/50',
              )
            }
          >
            {typeof it.icon === 'string' ? (
              <span className="material-symbols-outlined">{it.icon}</span>
            ) : (
              <span className="shrink-0">{it.icon}</span>
            )}
            <span className="text-label-md">{it.label}</span>
          </NavLink>
        ))}
      </nav>

      <div className="mt-auto border-t border-outline-variant pt-4 space-y-1">
        <NavLink
          to={
            isAdvertiser
              ? '/advertiser/settings'
              : isPublisher
                ? '/publisher/settings'
                : '/admin/settings'
          }
          className={({ isActive }) =>
            clsx(
              'flex items-center gap-3 px-4 py-3 rounded-lg transition-colors',
              isActive
                ? 'bg-secondary-container text-primary font-bold border-l-2 border-primary'
                : 'text-on-secondary-fixed-variant hover:bg-secondary-container/50',
            )
          }
        >
          <span className="material-symbols-outlined">settings</span>
          <span className="text-label-md">Stillingar</span>
        </NavLink>
        <button
          onClick={() => setIsHelpOpen(true)}
          className="flex items-center gap-3 px-4 py-3 rounded-lg transition-colors text-on-secondary-fixed-variant hover:bg-secondary-container/50 w-full text-left cursor-pointer"
        >
          <span className="material-symbols-outlined">help</span>
          <span className="text-label-md">Aðstoð</span>
        </button>
      </div>

      {isHelpOpen && (
        <div className="fixed inset-0 z-100 flex items-center justify-center bg-slate-900/60 backdrop-blur-md animate-fadeIn">
          <div className="bg-white rounded-2xl border border-slate-100 shadow-2xl max-w-lg w-full p-6 animate-scaleIn mx-4 relative text-slate-800">
            <button
              onClick={() => setIsHelpOpen(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 transition-colors p-1.5 hover:bg-slate-50 rounded-lg cursor-pointer"
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

            <div className="space-y-4 max-h-[360px] overflow-y-auto pr-1">
              {FAQS.map((faq, idx) => (
                <div key={idx} className="border-b border-slate-100 pb-3 last:border-0 last:pb-0">
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
                <p className="text-[11px] text-slate-500">Hafðu samband og við svörum fljótt.</p>
              </div>
              <a
                href="mailto:hjalp@birtingur.is?subject=Aðstoð varðandi Birting"
                className="inline-flex items-center justify-center gap-2 bg-primary hover:opacity-95 text-white text-xs font-bold px-4 py-2.5 rounded-xl transition-all shadow-sm shadow-primary/10 cursor-pointer"
              >
                <span className="material-symbols-outlined text-sm">mail</span>
                Senda tölvupóst
              </a>
            </div>
          </div>
        </div>
      )}
    </aside>
  );
}
