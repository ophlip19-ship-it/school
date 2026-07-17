import { useAuth } from '../context/AuthContext';
import { Link, useLocation } from 'react-router-dom';
import { Home, MapPin, User, Car, History, LayoutDashboard } from 'lucide-react';

const HIDDEN_PATHS = ['/', '/signup', '/verify', '/add-child', '/payment'];

export default function Navbar() {
  const { user, isAuthenticated } = useAuth();
  const location = useLocation();

  if (!isAuthenticated || HIDDEN_PATHS.includes(location.pathname)) {
    return null;
  }

  // Hide bottom nav on full-screen map / chat experiences
  if (location.pathname === '/live-tracking' || location.pathname === '/chat') {
    return null;
  }

  const nav =
    user?.role === 'parent'
      ? [
          { label: 'Home', icon: Home, path: '/dashboard' },
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
              { label: 'Profile', icon: User, path: '/profile' },
            ]
          : [];

  if (nav.length === 0) return null;

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-slate-200 bg-white/95 backdrop-blur">
      <div className="mx-auto flex max-w-lg justify-around py-2">
        {nav.map((item) => {
          const active =
            location.pathname === item.path ||
            (item.path !== '/' && location.pathname.startsWith(item.path + '/'));
          const Icon = item.icon;
          return (
            <Link
              key={item.path}
              to={item.path}
              className={`flex min-w-[64px] flex-col items-center gap-0.5 px-2 py-1 ${
                active ? 'text-emerald-600' : 'text-slate-500'
              }`}
            >
              <Icon size={22} strokeWidth={active ? 2.5 : 2} />
              <span className="text-[11px] font-medium">{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
