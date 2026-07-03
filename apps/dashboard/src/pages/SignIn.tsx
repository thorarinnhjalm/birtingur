import { useState } from 'react';
import { signInWithEmailAndPassword, signInWithPopup } from 'firebase/auth';
import { useNavigate } from 'react-router-dom';
import { auth, googleProvider } from '@/lib/firebase';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import Logo from '@/components/ui/Logo';

// Presentation reskinned to docs/superpowers/specs/2026-07-03-redesign-templates/auth.dc.html.
// The template also shows a tab switch (Innskráning/Nýskráning) with a
// "Nýskráning" form (company name + workspace picker + submit) that is
// intentionally NOT built here: there is no real account-creation handler in
// this codebase (signInWithEmailAndPassword requires an existing account) and
// advertiser self-signup is currently closed (see RoleSelect.tsx's
// REGISTRATION_CLOSED flag) — presenting a free "Auglýsandi" workspace choice
// would misrepresent that. Real signup already happens through this same
// Google/email sign-in (Google auto-creates a new Firebase user) followed by
// role selection at /role, so only the login state is implemented. The
// template's inert "Gleymt lykilorð?" span (no handler wired even in the
// template's own mock DCLogic) is dropped for the same reason dead-end
// controls were dropped elsewhere in this redesign.
export default function SignIn() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  function handleSuccessRedirect() {
    const lastRole = localStorage.getItem('ada_last_role');
    if (lastRole === 'advertiser') {
      navigate('/advertiser');
    } else if (lastRole === 'publisher') {
      navigate('/publisher');
    } else {
      navigate('/role');
    }
  }

  async function handleGoogle() {
    setError(null);
    setLoading(true);
    try {
      await signInWithPopup(auth, googleProvider);
      handleSuccessRedirect();
    } catch (e: any) {
      setError(e.message || 'Innskráning með Google mistókst');
    } finally {
      setLoading(false);
    }
  }

  async function handleEmail(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      await signInWithEmailAndPassword(auth, email, password);
      handleSuccessRedirect();
    } catch {
      setError('Innskráning mistókst. Vinsamlegast athugaðu netfang og lykilorð.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#f6f7f9] px-6 py-10">
      <div className="w-full max-w-[400px]">
        <div className="mb-10 flex items-center justify-center gap-3">
          <Logo size={36} />
          <span className="text-[19px] font-extrabold tracking-[-0.01em] text-slate-900">
            Birtingur
          </span>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-8">
          <h1 className="m-0 mb-[22px] text-[22px] font-extrabold tracking-[-0.02em] text-slate-900">
            Skráðu þig inn
          </h1>

          <Button
            type="button"
            variant="secondary"
            className="flex w-full items-center justify-center gap-3 border-slate-300 py-3 text-slate-700 shadow-[0_1px_2px_rgba(0,0,0,0.05)] hover:border-slate-400 hover:bg-slate-50"
            onClick={handleGoogle}
            disabled={loading}
          >
            <svg className="h-5 w-5 shrink-0" viewBox="0 0 24 24">
              <path
                fill="#EA4335"
                d="M12 5.04c1.66 0 3.2.57 4.38 1.69l3.27-3.27C17.67 1.54 14.98 1 12 1 7.35 1 3.37 3.68 1.39 7.56l3.85 2.99c.96-2.87 3.65-4.51 6.76-4.51z"
              />
              <path
                fill="#4285F4"
                d="M23.49 12.27c0-.81-.07-1.59-.2-2.34H12v4.51h6.46c-.29 1.48-1.14 2.73-2.43 3.58l3.77 2.92c2.2-2.03 3.69-5.02 3.69-8.67z"
              />
              <path
                fill="#FBBC05"
                d="M5.24 10.55c-.25-.76-.39-1.57-.39-2.41s.14-1.65.39-2.41L1.39 4.74C.5 6.52 0 8.52 0 10.64s.5 4.12 1.39 5.9l3.85-2.99c-.25-.76-.39-1.57-.39-2.41z"
              />
              <path
                fill="#34A853"
                d="M12 23c3.24 0 5.97-1.07 7.96-2.92l-3.77-2.92c-1.1.74-2.52 1.18-4.19 1.18-3.11 0-5.8-1.64-6.76-4.51L1.39 16.82C3.37 20.7 7.35 23 12 23z"
              />
            </svg>
            <span className="text-sm font-semibold">Halda áfram með Google</span>
          </Button>

          <div className="my-6 flex items-center">
            <div className="flex-1 border-t border-slate-200" />
            <span className="px-3 text-xs font-semibold tracking-wider text-slate-400 uppercase">
              eða
            </span>
            <div className="flex-1 border-t border-slate-200" />
          </div>

          <form onSubmit={handleEmail} className="flex flex-col gap-4">
            <Input
              label="Netfang"
              type="email"
              placeholder="netfang@fyrirtaeki.is"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              disabled={loading}
            />
            <Input
              label="Lykilorð"
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              disabled={loading}
            />

            {error && (
              <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs font-medium text-red-600">
                {error}
              </div>
            )}

            <Button
              type="submit"
              className="mt-1 w-full justify-center text-sm font-semibold"
              loading={loading}
            >
              Skrá inn
            </Button>
          </form>
        </div>

        <p className="mt-[22px] text-center text-[13px] leading-normal text-slate-400">
          Með því að halda áfram samþykkir þú skilmála og persónuverndarstefnu Birtings.
        </p>
      </div>
    </div>
  );
}
