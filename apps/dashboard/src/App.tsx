import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from '@/lib/auth-context';
import SignIn from '@/pages/SignIn';
import RoleSelect from '@/pages/RoleSelect';
import AdvertiserDashboard from '@/pages/advertiser/Dashboard';
import PublisherDashboard from '@/pages/publisher/Dashboard';
import AdminOverview from '@/pages/admin/Overview';
import LandingPage from '@/pages/LandingPage';
import Vibers from '@/pages/Vibers';
import Serfraedingar from '@/pages/Serfraedingar';
import Bjarni from '@/pages/Bjarni';
import { LoadingState } from '@/components/ui/LoadingState';
import Tryggvi from '@/pages/Tryggvi';
import AdvertiserLanding from '@/pages/AdvertiserLanding';
import PublisherLanding from '@/pages/PublisherLanding';
import FaqPage from '@/pages/FaqPage';
import TermsPage from '@/pages/TermsPage';

function Protected({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 p-8">
        <div className="max-w-md w-full">
          <LoadingState />
        </div>
      </div>
    );
  }
  if (!user) {
    return <Navigate to="/sign-in" replace />;
  }
  return <>{children}</>;
}

function AdminProtected({ children }: { children: React.ReactNode }) {
  const { user, admin, loading } = useAuth();
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 p-8">
        <div className="max-w-md w-full">
          <LoadingState />
        </div>
      </div>
    );
  }
  if (!user) {
    return <Navigate to="/sign-in" replace />;
  }
  if (!admin) {
    return <Navigate to="/role" replace />;
  }
  return <>{children}</>;
}

export default function App() {
  return (
    <Routes>
      <Route path="/sign-in" element={<SignIn />} />
      <Route
        path="/role"
        element={
          <Protected>
            <RoleSelect />
          </Protected>
        }
      />
      <Route
        path="/advertiser/*"
        element={
          <Protected>
            <AdvertiserDashboard />
          </Protected>
        }
      />
      <Route
        path="/publisher/*"
        element={
          <Protected>
            <PublisherDashboard />
          </Protected>
        }
      />
      <Route
        path="/admin/*"
        element={
          <AdminProtected>
            <AdminOverview />
          </AdminProtected>
        }
      />
      <Route path="/" element={<LandingPage />} />
      <Route path="/vibers" element={<Vibers />} />
      <Route path="/serfraedingar" element={<Serfraedingar />} />
      <Route path="/bjarni" element={<Bjarni />} />
      <Route path="/tryggvi" element={<Tryggvi />} />
      <Route path="/datera" element={<Tryggvi />} />
      <Route path="/auglysendur" element={<AdvertiserLanding />} />
      <Route path="/auglysendur/:region" element={<AdvertiserLanding />} />
      <Route path="/midlar" element={<PublisherLanding />} />
      <Route path="/midlar/:region" element={<PublisherLanding />} />
      <Route path="/faq" element={<FaqPage />} />
      <Route path="/skilmalar" element={<TermsPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
