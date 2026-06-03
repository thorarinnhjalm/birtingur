import { useState } from 'react';
import { signInWithEmailAndPassword, signInWithPopup } from 'firebase/auth';
import { useNavigate } from 'react-router-dom';
import { auth, googleProvider } from '@/lib/firebase';
import { useAuth } from '@/lib/auth-context';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Card } from '@/components/ui/Card';

export default function SignIn() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();
  const { signInDemo } = useAuth();

  async function handleGoogle() {
    setError(null);
    setLoading(true);
    try {
      await signInWithPopup(auth, googleProvider);
      navigate('/role');
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

    if ((email.trim() === 'DemoA' || email.trim() === 'demoa@birta.is') && password === 'password') {
      try {
        signInDemo('DemoA');
        navigate('/role');
        return;
      } catch (err: any) {
        setError('Innskráning á prufuaðgang mistókst.');
        return;
      } finally {
        setLoading(false);
      }
    }

    try {
      await signInWithEmailAndPassword(auth, email, password);
      navigate('/role');
    } catch (err: any) {
      setError('Innskráning mistókst. Vinsamlegast athugaðu netfang og lykilorð.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-radial from-slate-50 to-slate-200 p-4">
      <Card className="w-full max-w-md backdrop-blur-md bg-white/95 border border-slate-200/80 shadow-[0_8px_30px_rgba(0,0,0,0.06)] py-8 px-6">
        <div className="flex flex-col items-center justify-center mb-6">
          <div className="w-12 h-12 rounded-xl bg-primary flex items-center justify-center text-white font-extrabold text-2xl shadow-lg shadow-primary/20 mb-3">
            A
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight text-primary">ADA</h1>
          <p className="text-sm text-slate-500 mt-1 font-medium">Sjálfsafgreiðslu auglýsingavettvangur</p>
        </div>

        <Button
          className="w-full justify-center flex gap-3 text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 hover:border-slate-400 py-3 shadow-[0_1px_2px_rgba(0,0,0,0.05)] cursor-pointer"
          variant="secondary"
          onClick={handleGoogle}
          disabled={loading}
        >
          <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24">
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
          <span className="font-semibold text-sm">Halda áfram með Google</span>
        </Button>

        <div className="flex items-center my-6">
          <div className="flex-1 border-t border-slate-200" />
          <span className="px-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">eða</span>
          <div className="flex-1 border-t border-slate-200" />
        </div>

        <form onSubmit={handleEmail} className="space-y-4">
          <Input
            label="Netfang eða notendanafn"
            type="text"
            placeholder="DemoA eða nafn@fyrirtæki.is"
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
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs font-medium text-red-600">
              {error}
            </div>
          )}

          <Button type="submit" className="w-full justify-center text-sm font-semibold" loading={loading}>
            Skrá inn
          </Button>
        </form>

        <div className="mt-8 text-center text-xs text-slate-500">
          Með því að halda áfram samþykkir þú skilmála okkar og persónuverndarstefnu.
        </div>
      </Card>
    </div>
  );
}
