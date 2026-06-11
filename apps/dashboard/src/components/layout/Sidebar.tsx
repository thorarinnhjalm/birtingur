import { useState, type ReactNode } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import clsx from 'clsx';
import { apiFetch } from '@/lib/api';
import Logo from '@/components/ui/Logo';

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
  isOpen = false,
  onClose,
  onHelpClick,
}: {
  items: SidebarItem[];
  title?: string;
  isOpen?: boolean;
  onClose?: () => void;
  onHelpClick?: () => void;
}) {
  const location = useLocation();
  const navigate = useNavigate();

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
    <>
      {isOpen && <div className="fixed inset-0 bg-slate-900/40 z-40 md:hidden" onClick={onClose} />}
      <aside
        className={clsx(
          'bg-surface-container-low flex flex-col h-screen py-gutter px-4 w-[280px] fixed left-0 top-0 z-50 border-r border-outline-variant transition-transform duration-300 md:translate-x-0',
          isOpen ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        <div className="mb-10 px-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Logo size={36} className="shadow-md shadow-blue-500/10 rounded-lg" />
            <div>
              <h1 className="text-headline-sm font-bold text-primary leading-tight">{title}</h1>
              <p className="text-xs text-on-secondary-fixed-variant opacity-70 mt-0.5">
                Birtingur.app
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="md:hidden p-1 bg-transparent border-none text-slate-400 hover:text-slate-600 cursor-pointer flex items-center"
            type="button"
          >
            <span className="material-symbols-outlined text-[20px]">close</span>
          </button>
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
            onClick={onHelpClick}
            className="flex items-center gap-3 px-4 py-3 rounded-lg transition-colors text-on-secondary-fixed-variant hover:bg-secondary-container/50 w-full text-left cursor-pointer"
          >
            <span className="material-symbols-outlined">help</span>
            <span className="text-label-md">Aðstoð</span>
          </button>
        </div>
      </aside>
    </>
  );
}
