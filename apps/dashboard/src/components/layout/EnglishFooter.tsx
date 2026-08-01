import { Link } from 'react-router-dom';
import Logo from '@/components/ui/Logo';

export default function EnglishFooter() {
  return (
    <footer className="border-t border-slate-200 bg-slate-900 py-12 px-4 sm:px-6 lg:px-8 text-white">
      <div className="mx-auto max-w-6xl flex flex-col md:flex-row items-center justify-between gap-6">
        <div className="flex items-center gap-3">
          <Logo className="h-7 w-auto text-white" />
          <span className="text-xs text-slate-400">— The MCP-Native Category Display Network</span>
        </div>

        <div className="flex items-center gap-4 text-xs text-slate-400">
          <Link to="/en/guides" className="hover:text-white transition">
            Guides
          </Link>
          <Link to="/en" className="hover:text-white transition">
            Home
          </Link>
          <span className="text-center md:text-right">
            © {new Date().getFullYear()} Birtingur. All rights reserved. 100% Cookie-Free &amp; MCP
            Native.
          </span>
        </div>
      </div>
    </footer>
  );
}
