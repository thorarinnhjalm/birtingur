import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/lib/auth-context';
import { Button } from '../ui/Button';
import { LogOut } from 'lucide-react';

export function TopBar() {
  const { user, admin, signOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const isAdvertiser = location.pathname.startsWith('/advertiser');
  const isPublisher = location.pathname.startsWith('/publisher');
  const isAdmin = location.pathname.startsWith('/admin');

  // Role labels in Icelandic
  const userRoleLabel = isAdvertiser
    ? 'Auglýsingastjóri'
    : isPublisher
      ? 'Útgefandi'
      : 'Kerfisstjóri';
  const searchPlaceholder = isAdvertiser
    ? 'Leita að herferðum...'
    : isPublisher
      ? 'Leita að plássum...'
      : 'Leita í kerfinu...';

  // Dynamic greeting/name based on user email
  const displayName = user?.email?.split('@')[0] || 'Notandi';
  // Capitalize display name
  const formattedName = displayName.charAt(0).toUpperCase() + displayName.slice(1);

  return (
    <header className="bg-surface-container-lowest border-b border-outline-variant shadow-sm flex justify-between items-center w-full px-margin-desktop py-4 sticky top-0 z-40">
      {/* Search and Workspace Toggle */}
      <div className="flex items-center gap-6">
        <div className="flex items-center gap-4 bg-surface-container rounded-full px-4 py-2 w-72 lg:w-96">
          <span className="material-symbols-outlined text-outline">search</span>
          <input
            type="text"
            className="bg-transparent border-none outline-none focus:outline-none focus:ring-0 text-body-md w-full placeholder:text-on-secondary-container"
            placeholder={searchPlaceholder}
          />
        </div>

        {/* Workspace Switcher */}
        <div className="hidden md:flex items-center gap-2">
          <span className="text-xs font-semibold text-outline uppercase tracking-wider">
            Vinnusvæði:
          </span>
          <div className="inline-flex gap-1 bg-surface-container p-0.5 rounded-lg border border-outline-variant">
            <button
              onClick={() => navigate('/advertiser')}
              className={`px-3 py-1 text-xs font-semibold rounded-md transition-all cursor-pointer ${
                isAdvertiser
                  ? 'bg-white text-on-surface shadow-[0_1px_2px_rgba(0,0,0,0.05)]'
                  : 'text-on-secondary-container hover:text-on-surface'
              }`}
            >
              Auglýsandi
            </button>
            <button
              onClick={() => navigate('/publisher')}
              className={`px-3 py-1 text-xs font-semibold rounded-md transition-all cursor-pointer ${
                isPublisher
                  ? 'bg-white text-on-surface shadow-[0_1px_2px_rgba(0,0,0,0.05)]'
                  : 'text-on-secondary-container hover:text-on-surface'
              }`}
            >
              Útgefandi
            </button>
            {admin && (
              <button
                onClick={() => navigate('/admin')}
                className={`px-3 py-1 text-xs font-semibold rounded-md transition-all cursor-pointer ${
                  isAdmin
                    ? 'bg-primary text-white shadow-[0_1px_2px_rgba(30,58,138,0.15)]'
                    : 'text-on-secondary-container hover:text-on-surface'
                }`}
              >
                Stjórnandi
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Profile & Notifications & Logout */}
      <div className="flex items-center gap-4">
        {/* Notifications */}
        <button className="p-2 rounded-full hover:bg-secondary-container transition-all relative cursor-pointer">
          <span className="material-symbols-outlined text-secondary">notifications</span>
          <span className="absolute top-2 right-2 w-2 h-2 bg-error rounded-full"></span>
        </button>

        <div className="h-8 w-px bg-outline-variant mx-1"></div>

        {/* User Info */}
        <div className="flex items-center gap-3">
          <div className="text-right hidden sm:block">
            <p className="text-label-md text-on-surface font-bold">{formattedName}</p>
            <p className="text-[10px] text-outline uppercase tracking-wider font-bold">
              {userRoleLabel}
            </p>
          </div>
          <img
            alt="Notandaprúfíll"
            className="w-10 h-10 rounded-full border-2 border-primary-fixed shadow-sm"
            src="https://lh3.googleusercontent.com/aida-public/AB6AXuDOjCL0GQ3D8wsYiRelKx2Usp5siUfVPOlf9qSlgle2zchiLMt7GJlWfWWzDAxGzdZjj939JWEB2SxnLV_cs7E5NzNSvpfUMt-fLvjC9SDw8hnSHvGCFRh_nPWn49Tqu91Ccou8gqYB7PZDa7BzJaL7bPGygEwuRkS34kGxDNq25ywnHO2h0z6YWOHxZ6IJ9SJa0hAEAMask_Z-UxEOT3YUFDBlMZSRtGhJGaEs7XtrhmaOlFLETjK2JR8PZhwHor4974N_ZcPAVmQ"
          />
        </div>

        <div className="h-8 w-px bg-outline-variant mx-1"></div>

        {/* Logout */}
        <Button
          variant="ghost"
          className="text-on-secondary-container hover:text-on-surface py-2 px-3 border border-transparent hover:border-outline-variant rounded-lg"
          onClick={signOut}
        >
          <div className="flex items-center gap-2 text-xs">
            <LogOut size={14} />
            <span className="hidden sm:inline">Skrá út</span>
          </div>
        </Button>
      </div>
    </header>
  );
}
