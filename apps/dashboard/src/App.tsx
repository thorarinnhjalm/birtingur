import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from '@/lib/auth-context';
import SignIn from '@/pages/SignIn';
import RoleSelect from '@/pages/RoleSelect';
import AdvertiserDashboard from '@/pages/advertiser/Dashboard';
import PublisherDashboard from '@/pages/publisher/Dashboard';
import AdminOverview from '@/pages/admin/Overview';
import LandingPage from '@/pages/LandingPage';
import { LoadingState } from '@/components/ui/LoadingState';

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
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
