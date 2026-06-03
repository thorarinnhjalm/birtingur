import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import clsx from 'clsx';
import type { ReactNode } from 'react';

export interface SidebarItem {
  to: string;
  label: string;
  icon: string | ReactNode;
}

export function Sidebar({
  items,
  title = 'Auglýsingakerfi',
}: {
  items: SidebarItem[];
  title?: string;
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
        <a
          href="#"
          className="flex items-center gap-3 px-4 py-3 rounded-lg transition-colors text-on-secondary-fixed-variant hover:bg-secondary-container/50"
        >
          <span className="material-symbols-outlined">help</span>
          <span className="text-label-md">Aðstoð</span>
        </a>
      </div>
    </aside>
  );
}
