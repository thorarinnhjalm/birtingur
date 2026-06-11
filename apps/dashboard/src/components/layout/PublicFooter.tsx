import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Logo from '@/components/ui/Logo';
import { apiFetch } from '@/lib/api';

interface PublicFooterProps {
  onTabChange?: (tab: 'home' | 'advertisers' | 'publishers' | 'faq' | 'terms') => void;
}

export default function PublicFooter({ onTabChange }: PublicFooterProps) {
  const navigate = useNavigate();

  const [isContactOpen, setIsContactOpen] = useState(false);
  const [senderEmail, setSenderEmail] = useState('');
  const [senderName, setSenderName] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const handleOpen = (e: any) => {
      setIsContactOpen(true);
      setSent(false);
      setError(null);
      if (e.detail) {
        if (e.detail.subject) setSubject(e.detail.subject);
        if (e.detail.body) setBody(e.detail.body);
      } else {
        setSubject('');
        setBody('');
      }
    };
    window.addEventListener('open-public-support', handleOpen);
    return () => {
      window.removeEventListener('open-public-support', handleOpen);
    };
  }, []);

  const handleLinkClick = (tab: 'home' | 'advertisers' | 'publishers' | 'faq' | 'terms') => {
    if (onTabChange) {
      onTabChange(tab);
    } else {
      if (tab === 'advertisers') {
        navigate('/auglysendur');
      } else if (tab === 'publishers') {
        navigate('/midlar');
      } else if (tab === 'faq') {
        navigate('/faq');
      } else if (tab === 'terms') {
        navigate('/skilmalar');
      } else {
        navigate('/');
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!senderEmail.trim() || !subject.trim() || !body.trim()) return;
    setSending(true);
    setError(null);
    try {
      await apiFetch('/v1/support/public-messages', {
        method: 'POST',
        body: JSON.stringify({
          senderEmail: senderEmail.trim(),
          senderName: senderName.trim() || undefined,
          subject: subject.trim(),
          body: body.trim(),
        }),
      });
      setSent(true);
      setSenderEmail('');
      setSenderName('');
      setSubject('');
      setBody('');
    } catch (err: any) {
      setError(err?.message || 'Eitthvað fór úrskeiðis. Vinsamlegast reyndu aftur.');
    } finally {
      setSending(false);
    }
  };

  return (
    <footer className="bg-white border-t border-slate-200/80 py-12 mt-16 relative">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
          {/* Logo/Info */}
          <div className="space-y-4">
            <div
              className="flex items-center gap-2 cursor-pointer"
              onClick={() => handleLinkClick('home')}
            >
              <Logo size={32} className="shadow-md shadow-blue-500/10 rounded-lg" />
              <span className="font-extrabold text-lg text-slate-850">Birtingur</span>
            </div>
            <p className="text-xs text-slate-550 leading-relaxed">
              <strong>Neðri Hóll Hugmyndahús ehf.</strong>
              <br />
              Kt. 470126-2480 | VSK nr. 159950
              <br />
              Álfhólsvegi 97, 200 Kópavogur
            </p>
          </div>

          {/* Links Advertiser */}
          <div>
            <h4 className="text-xs uppercase font-extrabold tracking-wider text-slate-500 mb-3">
              Auglýsendur
            </h4>
            <ul className="space-y-2 text-xs">
              <li>
                <button
                  onClick={() => handleLinkClick('advertisers')}
                  className="text-slate-500 hover:text-slate-850 transition cursor-pointer bg-transparent border-0 p-0 font-normal text-left"
                >
                  Stofna herferð
                </button>
              </li>
              <li>
                <button
                  onClick={() => handleLinkClick('advertisers')}
                  className="text-slate-500 hover:text-slate-850 transition cursor-pointer bg-transparent border-0 p-0 font-normal text-left"
                >
                  Inneignir og greiðslur
                </button>
              </li>
            </ul>
          </div>

          {/* Links Publisher */}
          <div>
            <h4 className="text-xs uppercase font-extrabold tracking-wider text-slate-500 mb-3">
              Útgefendur
            </h4>
            <ul className="space-y-2 text-xs">
              <li>
                <button
                  onClick={() => handleLinkClick('publishers')}
                  className="text-slate-500 hover:text-slate-850 transition cursor-pointer bg-transparent border-0 p-0 font-normal text-left"
                >
                  Sækja kóða
                </button>
              </li>
              <li>
                <button
                  onClick={() => handleLinkClick('publishers')}
                  className="text-slate-500 hover:text-slate-850 transition cursor-pointer bg-transparent border-0 p-0 font-normal text-left"
                >
                  Tekjuöflun
                </button>
              </li>
            </ul>
          </div>

          {/* Legal / Contact */}
          <div>
            <h4 className="text-xs uppercase font-extrabold tracking-wider text-slate-500 mb-3">
              Þjónusta
            </h4>
            <ul className="space-y-2 text-xs text-slate-550">
              <li>
                <button
                  onClick={() => {
                    setIsContactOpen(true);
                    setSent(false);
                    setError(null);
                  }}
                  className="text-slate-500 hover:text-slate-850 transition cursor-pointer bg-transparent border-0 p-0 font-normal flex items-center gap-1 text-left"
                >
                  <span className="material-symbols-outlined text-sm">chat</span>
                  Hafa samband
                </button>
              </li>
              <li>
                <button
                  onClick={() => handleLinkClick('faq')}
                  className="text-slate-500 hover:text-slate-850 transition cursor-pointer bg-transparent border-0 p-0 font-normal text-left"
                >
                  Hjálparmiðstöð & FAQ
                </button>
              </li>
            </ul>
          </div>
        </div>

        <div className="pt-8 border-t border-slate-100 mt-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <span className="text-[10px] text-slate-500 font-semibold">
            © 2026 Birtingur (birtingur.app) – Neðri Hóll Hugmyndahús ehf. Allur réttur áskilinn.
          </span>
          <div className="flex gap-4 text-[10px] text-slate-550">
            <button
              onClick={() => handleLinkClick('terms')}
              className="hover:text-slate-800 transition cursor-pointer bg-transparent border-0 p-0 font-normal text-left"
            >
              Notendaskilmálar
            </button>
            <button
              onClick={() => handleLinkClick('terms')}
              className="hover:text-slate-800 transition cursor-pointer bg-transparent border-0 p-0 font-normal text-left"
            >
              Persónuverndarstefna
            </button>
          </div>
        </div>
      </div>

      {isContactOpen && (
        <div className="fixed inset-0 z-100 flex items-center justify-center bg-slate-900/60 backdrop-blur-md animate-fadeIn text-slate-800">
          <div className="bg-white rounded-2xl border border-slate-100 shadow-2xl max-w-lg w-full p-6 animate-scaleIn mx-4 relative">
            <button
              onClick={() => setIsContactOpen(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 transition-colors p-1.5 hover:bg-slate-50 rounded-lg cursor-pointer border-none bg-transparent"
            >
              <span className="material-symbols-outlined">close</span>
            </button>

            <div className="flex items-center gap-2.5 mb-6">
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
                <span className="material-symbols-outlined text-md">chat</span>
              </div>
              <div>
                <h3 className="text-lg font-bold text-slate-900 leading-tight">
                  Hafa samband við Birting
                </h3>
                <p className="text-xs text-slate-550">Sendu okkur skilaboð og við svörum fljótt.</p>
              </div>
            </div>

            {sent ? (
              <div className="flex flex-col items-center justify-center py-10 text-center">
                <div className="w-14 h-14 rounded-full bg-emerald-50 flex items-center justify-center mb-4">
                  <span className="material-symbols-outlined text-emerald-600 text-2xl font-bold">
                    check_circle
                  </span>
                </div>
                <h4 className="text-lg font-bold text-slate-900 mb-1">Skilaboð móttekin!</h4>
                <p className="text-sm text-slate-500 max-w-xs leading-relaxed">
                  Við höfum móttekið skilaboðin þín og munum svara þér á netfangið sem þú gafst upp
                  eins fljótt og auðið er.
                </p>
                <button
                  onClick={() => setIsContactOpen(false)}
                  className="mt-6 bg-primary text-white px-6 py-2.5 rounded-xl text-xs font-bold hover:opacity-95 transition-all cursor-pointer border-none"
                >
                  Loka
                </button>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                {error && (
                  <div className="p-3 bg-red-50 border border-red-100 text-red-650 rounded-xl text-xs font-semibold leading-relaxed animate-fadeIn">
                    {error}
                  </div>
                )}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1.5">Netfang</label>
                    <input
                      type="email"
                      value={senderEmail}
                      onChange={(e) => setSenderEmail(e.target.value)}
                      placeholder="dæmi@vefur.is"
                      required
                      className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1.5">
                      Nafn <span className="text-slate-400 font-normal">(valfrjálst)</span>
                    </label>
                    <input
                      type="text"
                      value={senderName}
                      onChange={(e) => setSenderName(e.target.value)}
                      placeholder="Þitt nafn"
                      className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">Efni</label>
                  <input
                    type="text"
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    placeholder="Hvað getum við aðstoðað þig með?"
                    required
                    className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">Skilaboð</label>
                  <textarea
                    value={body}
                    onChange={(e) => setBody(e.target.value)}
                    placeholder="Lýstu spurningunni eða vandanum þínum..."
                    required
                    rows={4}
                    className="w-full px-3.5 py-2.5 border border-slate-200 rounded-xl text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary resize-none"
                  />
                </div>
                <div className="flex gap-3 justify-end pt-2">
                  <button
                    type="button"
                    onClick={() => setIsContactOpen(false)}
                    className="text-sm text-slate-500 hover:text-slate-700 font-semibold px-3 py-2 cursor-pointer border-none bg-transparent"
                  >
                    Hætta við
                  </button>
                  <button
                    type="submit"
                    disabled={sending}
                    className="bg-primary text-white px-5 py-2.5 rounded-xl text-xs font-bold hover:opacity-95 transition-all shadow-sm shadow-primary/10 cursor-pointer disabled:opacity-50 flex items-center gap-2 border-none"
                  >
                    {sending ? (
                      <>
                        <span className="material-symbols-outlined text-sm animate-spin">
                          progress_activity
                        </span>
                        Sendi...
                      </>
                    ) : (
                      <>
                        <span className="material-symbols-outlined text-sm">send</span>
                        Senda skilaboð
                      </>
                    )}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </footer>
  );
}
