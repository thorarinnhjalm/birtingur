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
        <main className="flex-1 p-margin-desktop space-y-gutter max-w-7xl w-full mx-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
