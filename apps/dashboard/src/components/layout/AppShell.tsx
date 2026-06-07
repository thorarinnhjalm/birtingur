import type { ReactNode } from 'react';
import { Sidebar, type SidebarItem } from './Sidebar';
import { TopBar } from './TopBar';

export function AppShell({
  items,
  children,
  title,
}: {
  items: SidebarItem[];
  children: ReactNode;
  title?: string;
}) {
  return (
    <div className="min-h-screen flex bg-background font-sans antialiased text-on-background">
      <Sidebar items={items} title={title} />
      <div className="flex-1 flex flex-col min-w-0 pl-[280px]">
        <TopBar />
        <main className="flex-1 p-margin-desktop space-y-gutter max-w-7xl w-full mx-auto flex flex-col justify-between">
          <div className="flex-1">{children}</div>
          {/* Help link — non-intrusive */}
          <div className="text-center py-4 mt-8">
            <a
              href="mailto:hallo@birtingur.is"
              className="text-secondary text-label-md font-semibold hover:text-primary transition-colors inline-flex items-center gap-2"
            >
              <span className="material-symbols-outlined text-sm">mail</span>
              Þarftu aðstoð? Sendu okkur línu á hallo@birtingur.is
            </a>
          </div>
        </main>
      </div>
    </div>
  );
}
