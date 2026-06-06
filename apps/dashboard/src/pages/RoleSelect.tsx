import { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Card } from '@/components/ui/Card';
import { useAuth } from '@/lib/auth-context';
import { useAdvertiser } from '@/hooks/useAdvertiser';
import { usePublisher } from '@/hooks/usePublisher';
import { LoadingState } from '@/components/ui/LoadingState';
import { ArrowRight, Megaphone, Globe, Shield } from 'lucide-react';

export default function RoleSelect() {
  const { admin } = useAuth();
  const advertiserQuery = useAdvertiser();
  const publisherQuery = usePublisher();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const bypassRedirect =
    searchParams.get('select') === 'true' || searchParams.get('switch') === 'true';

  useEffect(() => {
    if (bypassRedirect) return;
    if (advertiserQuery.isPending || publisherQuery.isPending) return;

    const hasAdvertiser = !!advertiserQuery.data;
    const hasPublisher = !!publisherQuery.data;
    const lastRole = localStorage.getItem('ada_last_role');

    // Prefer the remembered role when the user actually has that profile — this is
    // what sends a dual-role user (e.g. the demo account, which owns both an
    // advertiser and a publisher) straight to their last dashboard instead of the chooser.
    if (lastRole === 'advertiser' && hasAdvertiser) {
      navigate('/advertiser', { replace: true });
    } else if (lastRole === 'publisher' && hasPublisher) {
      navigate('/publisher', { replace: true });
    } else if (hasAdvertiser && !hasPublisher) {
      localStorage.setItem('ada_last_role', 'advertiser');
      navigate('/advertiser', { replace: true });
    } else if (hasPublisher && !hasAdvertiser) {
      localStorage.setItem('ada_last_role', 'publisher');
      navigate('/publisher', { replace: true });
    }
    // Dual-role with no remembered choice (or no profile at all) → show the chooser.
  }, [
    advertiserQuery.data,
    advertiserQuery.isPending,
    publisherQuery.data,
    publisherQuery.isPending,
    bypassRedirect,
    navigate,
  ]);

  if (advertiserQuery.isPending || publisherQuery.isPending) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 p-8">
        <div className="max-w-md w-full">
          <LoadingState />
        </div>
      </div>
    );
  }

  const handleAdvertiserSelect = () => {
    localStorage.setItem('ada_last_role', 'advertiser');
    // If advertiser profile already exists, go to home, else onboarding
    if (advertiserQuery.data) {
      navigate('/advertiser');
    } else {
      navigate('/advertiser/onboarding');
    }
  };

  const handlePublisherSelect = () => {
    localStorage.setItem('ada_last_role', 'publisher');
    // If publisher profile already exists, go to home, else onboarding
    if (publisherQuery.data) {
      navigate('/publisher');
    } else {
      navigate('/publisher/onboarding');
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 p-6">
      <div className="max-w-4xl w-full">
        <div className="text-center mb-10">
          <h1 className="text-3xl font-extrabold tracking-tight text-slate-900 sm:text-4xl">
            Veldu þitt hlutverk
          </h1>
          <p className="mt-3 max-w-2xl mx-auto text-base text-slate-500 sm:mt-4 font-medium">
            Hvernig ætlarðu að nota Birting í dag? Þú getur breytt þessu hvenær sem er.
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          {/* Advertiser Card */}
          <Card
            className="cursor-pointer group flex flex-col justify-between h-72 hover:border-primary border-2 border-transparent transition-all duration-300"
            onClick={handleAdvertiserSelect}
          >
            <div>
              <div className="w-12 h-12 rounded-xl bg-blue-50 text-primary flex items-center justify-center mb-5 group-hover:bg-primary group-hover:text-white transition-all">
                <Megaphone size={24} />
              </div>
              <h3 className="text-xl font-bold text-slate-900 group-hover:text-primary transition-colors">
                Ég vil birta auglýsingar
              </h3>
              <p className="text-sm text-slate-500 mt-2 font-medium leading-relaxed">
                Kynntu vörur þínar eða þjónustu. Settu inn inneign, hladdu upp auglýsingum og veldu
                markviss pláss á íslenskum vefjum.
              </p>
            </div>
            <div className="flex items-center gap-1.5 text-sm font-bold text-primary mt-4">
              <span>Fara í auglýsingaborð</span>
              <ArrowRight
                size={16}
                className="transform group-hover:translate-x-1 transition-transform"
              />
            </div>
          </Card>

          {/* Publisher Card */}
          <Card
            className="cursor-pointer group flex flex-col justify-between h-72 hover:border-sky-600 border-2 border-transparent transition-all duration-300"
            onClick={handlePublisherSelect}
          >
            <div>
              <div className="w-12 h-12 rounded-xl bg-sky-50 text-sky-600 flex items-center justify-center mb-5 group-hover:bg-sky-600 group-hover:text-white transition-all">
                <Globe size={24} />
              </div>
              <h3 className="text-xl font-bold text-slate-900 group-hover:text-sky-600 transition-colors">
                Ég vil selja auglýsingapláss
              </h3>
              <p className="text-sm text-slate-500 mt-2 font-medium leading-relaxed">
                Fáðu tekjur af vefnum þínum. Stofnaðu og stjórnaðu auglýsingaplássum og fáðu greitt
                sjálfvirkt fyrir birtingar.
              </p>
            </div>
            <div className="flex items-center gap-1.5 text-sm font-bold text-sky-600 mt-4">
              <span>Fara í útgefandaborð</span>
              <ArrowRight
                size={16}
                className="transform group-hover:translate-x-1 transition-transform"
              />
            </div>
          </Card>
        </div>

        {admin && (
          <div className="mt-8 flex justify-center">
            <button
              onClick={() => navigate('/admin')}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-slate-800 text-white hover:bg-slate-900 transition-all font-semibold text-xs cursor-pointer shadow-sm"
            >
              <Shield size={14} />
              <span>Sýna stjórnborð (Admin Dashboard)</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
