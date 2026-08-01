import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import Logo from '@/components/ui/Logo';
import { Button } from '@/components/ui/Button';

export default function EnglishHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-slate-200/80 bg-white/90 backdrop-blur-md">
      <div className="mx-auto flex h-20 max-w-6xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <div className="flex items-center gap-3">
          <Link to="/en" className="flex items-center gap-2 text-slate-900 no-underline">
            <Logo className="h-8 w-auto text-primary" />
          </Link>
          <span className="rounded-full bg-primary/10 border border-primary/20 px-2.5 py-0.5 text-[11px] font-bold text-primary uppercase tracking-wider">
            MCP Ready
          </span>
        </div>

        <div className="flex items-center gap-4">
          <Link
            to="/en/guides"
            className="text-xs font-bold text-slate-600 hover:text-primary hidden sm:inline"
          >
            Guides &amp; Articles
          </Link>
          <Link to="/en#waitlist-section">
            <Button variant="primary" className="text-xs font-bold py-2.5 px-4">
              <span className="flex items-center gap-1.5">
                <span>Join Waitlist</span>
                <ArrowRight className="h-3.5 w-3.5" />
              </span>
            </Button>
          </Link>
        </div>
      </div>
    </header>
  );
}
