import { lazy, Suspense } from 'react';
import {
  BrowserRouter as Router,
  Routes,
  Route,
  Navigate,
  useLocation,
} from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import Navbar from './components/Navbar';

const NAV_HIDDEN = new Set([
  '/',
  '/signup',
  '/verify',
  '/add-child',
  '/payment',
  '/live-tracking',
  '/pick-locations',
  '/chat',
  '/admin/transit',
]);

import Welcome from './pages/welcome';
import SignUp from './pages/SignUp';
import VerifyAccount from './pages/VerifyAccount';
import AddChildProfile from './pages/AddChildProfile';
import HomeDashboard from './pages/HomeDashboard';
import SelectChildren from './pages/SelectChildren';
import PickLocations from './pages/PickLocations';
import DateSchedule from './pages/dateSchedule';
import VehicleReview from './pages/VehicleReview';
import Payment from './pages/Payment';
import ChatScreen from './pages/ChatScreen';
import RideHistory from './pages/RideHistory';
import RideDetails from './pages/RideDetails';
import ProfileScreen from './pages/ProfileScreen';
import DriverAvailableRides from './pages/DriverAvailableRides';
import DriverTripActive from './pages/DriverTripActive';
import DriverDashboard from './pages/DriverDashboard';
import AdminDashboard from './pages/AdminDashboard';
import ErrorState, { NotFoundScreen } from './components/ErrorState';
import { Home, ArrowLeft } from 'lucide-react';

// Mapbox is heavy — load only when opening live tracking / admin transit map
const LiveTracking = lazy(() => import('./pages/LiveTracking'));
const AdminTransitMap = lazy(() => import('./pages/AdminTransitMap'));

function ScreenLoader() {
  return (
    <div className="flex min-h-screen items-center justify-center text-slate-500">
      Loading…
    </div>
  );
}

function ForbiddenScreen({ homeTo = '/dashboard' }) {
  return (
    <ErrorState
      variant="forbidden"
      code="403"
      title="You don’t have access"
      message="This area is for a different SchoolRun role. Head back to your home screen to continue."
      actions={[
        {
          label: 'Go to my home',
          to: homeTo,
          primary: true,
          icon: <Home size={16} />,
        },
        {
          label: 'Go back',
          onClick: () => window.history.back(),
          icon: <ArrowLeft size={16} />,
        },
      ]}
    />
  );
}

function ProtectedRoute({ children, roles }) {
  const { isAuthenticated, isLoading, user } = useAuth();

  if (isLoading) {
    return <ScreenLoader />;
  }

  if (!isAuthenticated) {
    return <Navigate to="/signup" replace />;
  }

  if (roles && user?.role && !roles.includes(user.role)) {
    const homeTo =
      user.role === 'driver'
        ? '/driver'
        : user.role === 'admin'
          ? '/admin'
          : '/dashboard';
    return <ForbiddenScreen homeTo={homeTo} />;
  }

  return children;
}

function AppShell({ children }) {
  const { isAuthenticated } = useAuth();
  const { pathname } = useLocation();
  const showNav = isAuthenticated && !NAV_HIDDEN.has(pathname);

  return (
    <div
      className={`min-h-screen bg-slate-50 ${
        showNav
          ? 'pb-24 lg:pb-0 lg:pt-14'
          : 'pb-0 pt-0'
      }`}
    >
      {children}
    </div>
  );
}

function AppRoutes() {
  return (
    <AppShell>
      <Routes>
        <Route path="/" element={<Welcome />} />
        <Route path="/signup" element={<SignUp />} />
        <Route
          path="/verify"
          element={
            <ProtectedRoute roles={['parent']}>
              <VerifyAccount />
            </ProtectedRoute>
          }
        />
        <Route
          path="/add-child"
          element={
            <ProtectedRoute roles={['parent']}>
              <AddChildProfile />
            </ProtectedRoute>
          }
        />

        <Route
          path="/dashboard"
          element={
            <ProtectedRoute roles={['parent']}>
              <HomeDashboard />
            </ProtectedRoute>
          }
        />
        <Route
          path="/select-children"
          element={
            <ProtectedRoute roles={['parent']}>
              <SelectChildren />
            </ProtectedRoute>
          }
        />
        <Route
          path="/pick-locations"
          element={
            <ProtectedRoute roles={['parent']}>
              <PickLocations />
            </ProtectedRoute>
          }
        />
        <Route
          path="/schedule"
          element={
            <ProtectedRoute roles={['parent']}>
              <DateSchedule />
            </ProtectedRoute>
          }
        />
        <Route
          path="/vehicle-review"
          element={
            <ProtectedRoute roles={['parent']}>
              <VehicleReview />
            </ProtectedRoute>
          }
        />
        <Route
          path="/payment"
          element={
            <ProtectedRoute roles={['parent']}>
              <Payment />
            </ProtectedRoute>
          }
        />
        <Route
          path="/history"
          element={
            <ProtectedRoute roles={['parent']}>
              <RideHistory />
            </ProtectedRoute>
          }
        />
        <Route
          path="/ride-details"
          element={
            <ProtectedRoute roles={['parent']}>
              <RideDetails />
            </ProtectedRoute>
          }
        />

        <Route
          path="/live-tracking"
          element={
            <ProtectedRoute roles={['parent', 'driver']}>
              <Suspense fallback={<ScreenLoader />}>
                <LiveTracking />
              </Suspense>
            </ProtectedRoute>
          }
        />
        <Route
          path="/chat"
          element={
            <ProtectedRoute roles={['parent', 'driver']}>
              <ChatScreen />
            </ProtectedRoute>
          }
        />
        <Route
          path="/profile"
          element={
            <ProtectedRoute roles={['parent', 'driver', 'admin']}>
              <ProfileScreen />
            </ProtectedRoute>
          }
        />

        <Route
          path="/driver"
          element={
            <ProtectedRoute roles={['driver']}>
              <DriverDashboard />
            </ProtectedRoute>
          }
        />
        <Route
          path="/driver/rides"
          element={
            <ProtectedRoute roles={['driver']}>
              <DriverAvailableRides />
            </ProtectedRoute>
          }
        />
        <Route
          path="/driver/active"
          element={
            <ProtectedRoute roles={['driver']}>
              <DriverTripActive />
            </ProtectedRoute>
          }
        />

        <Route
          path="/admin"
          element={
            <ProtectedRoute roles={['admin']}>
              <AdminDashboard />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/transit"
          element={
            <ProtectedRoute roles={['admin']}>
              <Suspense fallback={<ScreenLoader />}>
                <AdminTransitMap />
              </Suspense>
            </ProtectedRoute>
          }
        />

        <Route
          path="*"
          element={
            <NotFoundScreen homeTo="/" />
          }
        />
      </Routes>
    </AppShell>
  );
}

function App() {
  return (
    <AuthProvider>
      <Router>
        <AppRoutes />
        <Navbar />
      </Router>
    </AuthProvider>
  );
}

export default App;
