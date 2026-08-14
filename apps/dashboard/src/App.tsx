import { lazy, Suspense } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from '@/lib/auth-context';
import { LoadingState } from '@/components/ui/LoadingState';

const SignIn = lazy(() => import('@/pages/SignIn'));
const RoleSelect = lazy(() => import('@/pages/RoleSelect'));
const AdvertiserDashboard = lazy(() => import('@/pages/advertiser/Dashboard'));
const PublisherDashboard = lazy(() => import('@/pages/publisher/Dashboard'));
const AdminOverview = lazy(() => import('@/pages/admin/Overview'));
const LandingPage = lazy(() => import('@/pages/LandingPage'));
const Vibers = lazy(() => import('@/pages/Vibers'));
const Serfraedingar = lazy(() => import('@/pages/Serfraedingar'));
const Bjarni = lazy(() => import('@/pages/Bjarni'));
const Tryggvi = lazy(() => import('@/pages/Tryggvi'));
const AdvertiserLanding = lazy(() => import('@/pages/AdvertiserLanding'));
const PublisherLanding = lazy(() => import('@/pages/PublisherLanding'));
const FaqPage = lazy(() => import('@/pages/FaqPage'));
const TermsPage = lazy(() => import('@/pages/TermsPage'));
const BlogOverview = lazy(() => import('@/pages/BlogOverview'));
const BlogPost = lazy(() => import('@/pages/BlogPost'));
const EnglishLanding = lazy(() => import('@/pages/EnglishLanding'));
const EnglishCategoryPage = lazy(() => import('@/pages/EnglishCategoryPage'));
const EnglishGuidePage = lazy(() => import('@/pages/EnglishGuidePage'));
const EnglishGuideOverview = lazy(() => import('@/pages/EnglishGuideOverview'));

function PageFallback() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 p-8">
      <div className="max-w-md w-full">
        <LoadingState />
      </div>
    </div>
  );
}

function Protected({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) {
    return <PageFallback />;
  }
  if (!user) {
    return <Navigate to="/sign-in" replace />;
  }
  return <>{children}</>;
}

function AdminProtected({ children }: { children: React.ReactNode }) {
  const { user, admin, loading } = useAuth();
  if (loading) {
    return <PageFallback />;
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
    <Suspense fallback={<PageFallback />}>
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
        <Route path="/handbaekur" element={<BlogOverview />} />
        <Route path="/handbaekur/:slug" element={<BlogPost />} />
        <Route path="/en" element={<EnglishLanding />} />
        <Route path="/en/categories/:slug" element={<EnglishCategoryPage />} />
        <Route path="/en/guides" element={<EnglishGuideOverview />} />
        <Route path="/en/guides/:slug" element={<EnglishGuidePage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}
