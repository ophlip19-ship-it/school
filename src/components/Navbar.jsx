import { useAuth } from '../context/AuthContext';
import { Link, useLocation } from 'react-router-dom';
import {
  Home,
  MapPin,
  User,
  Car,
  History,
  LayoutDashboard,
  Route,
} from 'lucide-react';

const HIDDEN_PATHS = ['/', '/signup', '/verify', '/add-child', '/payment'];

export default function Navbar() {
  const { user, isAuthenticated } = useAuth();
  const location = useLocation();
  const fullBleed =
    location.pathname === '/live-tracking' ||
    location.pathname === '/pick-locations' ||
    location.pathname === '/chat' ||
    location.pathname === '/admin/transit';

  const nav =
    user?.role === 'parent'
      ? [
          { label: 'Home', icon: Home, path: '/dashboard' },
          { label: 'Active trips', icon: Route, path: '/active-trips' },
          { label: 'Track', icon: MapPin, path: '/live-tracking' },
          { label: 'History', icon: History, path: '/history' },
          { label: 'Profile', icon: User, path: '/profile' },
        ]
      : user?.role === 'driver'
        ? [
            { label: 'Home', icon: Home, path: '/driver' },
            { label: 'Rides', icon: Car, path: '/driver/rides' },
            { label: 'Active', icon: MapPin, path: '/driver/active' },
            { label: 'Profile', icon: User, path: '/profile' },
          ]
        : user?.role === 'admin'
          ? [
              { label: 'Dashboard', icon: LayoutDashboard, path: '/admin' },
              { label: 'Transit', icon: MapPin, path: '/admin/transit' },
              { label: 'Profile', icon: User, path: '/profile' },
            ]
          : [];

  const showNavigation =
    isAuthenticated &&
    nav.length > 0 &&
    !HIDDEN_PATHS.includes(location.pathname) &&
    !fullBleed;

  const linkClass = (active) =>
    `flex min-w-[64px] flex-col items-center gap-0.5 rounded-xl px-2 py-1.5 transition lg:min-w-0 lg:flex-row lg:gap-2 lg:px-3 lg:py-2 ${
      active
        ? 'text-emerald-600 lg:bg-emerald-50 lg:font-semibold'
        : 'text-slate-500 hover:text-slate-800 lg:hover:bg-slate-50'
    }`;

  const items = nav.map((item) => {
    const active =
      location.pathname === item.path ||
      (item.path !== '/' && location.pathname.startsWith(`${item.path}/`));
    const Icon = item.icon;
    return (
      <Link key={item.path} to={item.path} className={linkClass(active)}>
        <Icon size={22} strokeWidth={active ? 2.5 : 2} className="lg:h-5 lg:w-5" />
        <span className="text-[11px] font-medium lg:text-sm">{item.label}</span>
      </Link>
    );
  });

  return (
    <>
      <header
        className={`fixed top-0 left-0 right-0 z-50 border-b border-slate-200/80 bg-white/95 backdrop-blur ${
          fullBleed ? 'pointer-events-none border-transparent bg-transparent' : ''
        }`}
      >
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6">
          <Link
            to={
              !isAuthenticated
                ? '/'
                : user?.role === 'driver'
                ? '/driver'
                : user?.role === 'admin'
                  ? '/admin'
                  : '/dashboard'
            }
            aria-label="SchoolRun home"
            className="pointer-events-auto flex shrink-0 items-center gap-2 font-bold text-slate-900"
          >
            <img
              src="/product-logo.png"
              alt="SchoolRun"
              className="h-10 w-10 object-contain"
            />
            <span className="hidden sm:inline">SchoolRun</span>
            {showNavigation && (
              <span className="ml-1 hidden rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-700 sm:inline">
                {user?.role || 'user'}
              </span>
            )}
          </Link>
          {showNavigation && (
            <nav className="hidden items-center gap-1 lg:flex">{items}</nav>
          )}
        </div>
      </header>

      {showNavigation && (
        <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-slate-200 bg-white/95 backdrop-blur lg:hidden safe-bottom">
          <div className="mx-auto flex max-w-lg justify-around py-2 sm:max-w-2xl">
            {items}
          </div>
        </nav>
      )}
    </>
  );
}
