import { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/lib/auth-context';
import { Button } from '../ui/Button';
import { LogOut, CheckCircle, AlertTriangle, AlertCircle, Info } from 'lucide-react';
import {
  useNotifications,
  useMarkNotificationRead,
  useMarkAllNotificationsRead,
  type Notification,
} from '@/hooks/useNotifications';
import { formatRelative } from '@/lib/format';

// Mock notifications helper removed

export function TopBar({ onMenuClick }: { onMenuClick?: () => void }) {
  const { user, admin, signOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const isAdvertiser = location.pathname.startsWith('/advertiser');
  const isPublisher = location.pathname.startsWith('/publisher');
  const isAdmin = location.pathname.startsWith('/admin');

  const role: 'advertiser' | 'publisher' | 'admin' = isAdvertiser
    ? 'advertiser'
    : isPublisher
      ? 'publisher'
      : 'admin';

  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const { data: notificationsData } = useNotifications(role);
  const notifications = notificationsData || [];

  const markReadMutation = useMarkNotificationRead(role);
  const markAllReadMutation = useMarkAllNotificationsRead(role);

  // Click outside to close dropdown
  useEffect(() => {
    function handleClickOutside(event: any) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const unreadCount = notifications.filter((n) => !n.read).length;

  const markAllAsRead = () => {
    markAllReadMutation.mutate();
  };

  const handleNotificationClick = (item: Notification) => {
    // 1. Mark as read
    if (!item.read) {
      markReadMutation.mutate(item.id);
    }

    // 2. Navigate based on notification link or fallback
    if (item.link) {
      navigate(item.link);
    } else {
      // Fallback paths matching original mock logic if link is missing
      if (item.id.startsWith('adv')) {
        if (item.id === 'adv-1' || item.id === 'adv-2') {
          navigate('/advertiser/topup');
        } else {
          navigate('/advertiser');
        }
      } else if (item.id.startsWith('pub')) {
        if (item.id === 'pub-1') {
          navigate('/publisher/settings');
        } else if (item.id === 'pub-2') {
          navigate('/publisher/earnings');
        } else {
          navigate('/publisher/slots');
        }
      } else if (item.id.startsWith('adm') || item.id.startsWith('not')) {
        if (item.id === 'adm-1') {
          navigate('/admin/publishers');
        } else if (item.id === 'adm-2') {
          navigate('/admin/review');
        } else {
          navigate('/admin');
        }
      }
    }

    // 3. Close the dropdown
    setIsDropdownOpen(false);
  };

  const formatNotificationTime = (dateStr: string) => {
    try {
      const date = new Date(dateStr);
      const diffMs = Date.now() - date.getTime();
      const diffMin = Math.floor(diffMs / 60000);
      const diffHrs = Math.floor(diffMin / 60);

      if (diffMin < 1) return 'Nýlega';
      if (diffMin < 60) return `Fyrir ${diffMin} mín`;
      if (diffHrs < 24) return `Fyrir ${diffHrs} klst`;

      return formatRelative(date);
    } catch {
      return '';
    }
  };

  const getNotificationIcon = (type: Notification['type']) => {
    switch (type) {
      case 'success':
        return <CheckCircle size={16} className="text-success" />;
      case 'warning':
        return <AlertTriangle size={16} className="text-warning" />;
      case 'error':
        return <AlertCircle size={16} className="text-error" />;
      default:
        return <Info size={16} className="text-primary" />;
    }
  };

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
    <header className="bg-surface-container-lowest border-b border-outline-variant shadow-sm flex justify-between items-center w-full px-4 md:px-margin-desktop py-4 sticky top-0 z-40">
      {/* Search and Workspace Toggle */}
      <div className="flex items-center gap-4">
        {onMenuClick && (
          <button
            onClick={onMenuClick}
            className="md:hidden p-1 bg-transparent border-none text-slate-500 hover:text-slate-700 cursor-pointer flex items-center"
            aria-label="Opna valmynd"
          >
            <span className="material-symbols-outlined text-[24px]">menu</span>
          </button>
        )}
        <div className="flex items-center gap-4 bg-surface-container rounded-full px-4 py-2 w-36 sm:w-72 lg:w-96">
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
        <div className="relative" ref={dropdownRef}>
          <button
            onClick={() => setIsDropdownOpen(!isDropdownOpen)}
            className="p-2 rounded-full hover:bg-secondary-container transition-all relative cursor-pointer flex items-center justify-center"
            aria-label="Tilkynningar"
          >
            <span className="material-symbols-outlined text-secondary">notifications</span>
            {unreadCount > 0 && (
              <span className="absolute top-2 right-2 w-2.5 h-2.5 bg-error rounded-full ring-2 ring-white animate-pulse"></span>
            )}
          </button>

          {isDropdownOpen && (
            <div className="absolute right-0 mt-2 w-80 sm:w-96 bg-white/95 border border-outline-variant rounded-2xl shadow-xl z-50 overflow-hidden backdrop-blur-md">
              {/* Header */}
              <div className="p-4 border-b border-outline-variant flex justify-between items-center bg-surface-container-low">
                <h3 className="text-sm font-bold text-on-surface">Tilkynningar</h3>
                {unreadCount > 0 && (
                  <button
                    onClick={markAllAsRead}
                    className="text-xs font-semibold text-primary hover:text-primary-dim transition-all cursor-pointer"
                  >
                    Merkja allar sem lesnar
                  </button>
                )}
              </div>

              {/* List */}
              <div className="max-h-80 overflow-y-auto divide-y divide-outline-variant">
                {notifications.length === 0 ? (
                  <div className="p-6 text-center text-outline text-xs">Engar tilkynningar.</div>
                ) : (
                  notifications.map((item) => (
                    <div
                      key={item.id}
                      onClick={() => handleNotificationClick(item)}
                      className={`p-4 flex gap-3 cursor-pointer hover:bg-surface-container transition-all text-left ${
                        !item.read ? 'bg-primary-container/20' : ''
                      }`}
                    >
                      <div className="mt-0.5 shrink-0">{getNotificationIcon(item.type)}</div>
                      <div className="flex-1 min-w-0">
                        <div className="flex justify-between items-start gap-2">
                          <p
                            className={`text-xs ${
                              !item.read ? 'font-bold text-on-surface' : 'text-on-surface-variant'
                            }`}
                          >
                            {item.title}
                          </p>
                          <span className="text-[10px] text-outline whitespace-nowrap">
                            {formatNotificationTime(item.createdAt)}
                          </span>
                        </div>
                        <p className="text-xs text-on-surface-variant mt-1 leading-normal wrap-break-word">
                          {item.message}
                        </p>
                      </div>
                      {!item.read && (
                        <div className="w-1.5 h-1.5 bg-primary rounded-full mt-1.5 shrink-0"></div>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        <div className="h-8 w-px bg-outline-variant mx-1"></div>

        {/* User Info */}
        <div className="flex items-center gap-3">
          <div className="text-right hidden sm:block">
            <p className="text-label-md text-on-surface font-bold">{formattedName}</p>
            <p className="text-[10px] text-outline uppercase tracking-wider font-bold">
              {userRoleLabel}
            </p>
          </div>
          {user?.photoURL ? (
            <img
              alt="Notandaprúfíll"
              className="w-10 h-10 rounded-full border-2 border-primary-fixed shadow-sm object-cover"
              src={user.photoURL}
            />
          ) : (
            <div className="w-10 h-10 rounded-full border-2 border-primary-fixed shadow-sm bg-primary text-white flex items-center justify-center font-bold text-sm select-none">
              {formattedName.charAt(0).toUpperCase()}
            </div>
          )}
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
