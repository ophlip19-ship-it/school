import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  WifiOff,
  MapPinOff,
  FileQuestion,
  ShieldAlert,
  ServerCrash,
  RefreshCw,
  Home,
  ArrowLeft,
} from 'lucide-react';

const VARIANTS = {
  error: {
    icon: AlertTriangle,
    ring: 'bg-rose-50 text-rose-600 ring-rose-100',
    accent: 'text-rose-700',
    blob: 'from-rose-100/80 via-white to-slate-50',
  },
  warning: {
    icon: AlertTriangle,
    ring: 'bg-amber-50 text-amber-600 ring-amber-100',
    accent: 'text-amber-800',
    blob: 'from-amber-100/80 via-white to-slate-50',
  },
  offline: {
    icon: WifiOff,
    ring: 'bg-slate-100 text-slate-600 ring-slate-200',
    accent: 'text-slate-700',
    blob: 'from-slate-100 via-white to-slate-50',
  },
  notFound: {
    icon: FileQuestion,
    ring: 'bg-indigo-50 text-indigo-600 ring-indigo-100',
    accent: 'text-indigo-700',
    blob: 'from-indigo-50 via-white to-slate-50',
  },
  map: {
    icon: MapPinOff,
    ring: 'bg-amber-50 text-amber-700 ring-amber-100',
    accent: 'text-amber-900',
    blob: 'from-amber-50 via-white to-emerald-50/40',
  },
  forbidden: {
    icon: ShieldAlert,
    ring: 'bg-orange-50 text-orange-600 ring-orange-100',
    accent: 'text-orange-800',
    blob: 'from-orange-50 via-white to-slate-50',
  },
  server: {
    icon: ServerCrash,
    ring: 'bg-rose-50 text-rose-600 ring-rose-100',
    accent: 'text-rose-800',
    blob: 'from-rose-50 via-white to-slate-50',
  },
};

/**
 * Full-page intentional error experience.
 *
 * @param {'error'|'warning'|'offline'|'notFound'|'map'|'forbidden'|'server'} [props.variant]
 * @param {string} props.title
 * @param {string} [props.message]
 * @param {string} [props.code] — optional status / reference code
 * @param {{ label: string, to?: string, onClick?: () => void, primary?: boolean }[]} [props.actions]
 * @param {React.ReactNode} [props.children]
 * @param {boolean} [props.compact] — card-sized instead of full viewport
 */
export default function ErrorState({
  variant = 'error',
  title,
  message,
  code,
  actions = [],
  children,
  compact = false,
}) {
  const theme = VARIANTS[variant] || VARIANTS.error;
  const Icon = theme.icon;

  const shell = compact
    ? 'relative overflow-hidden rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8'
    : 'relative flex min-h-[70vh] w-full flex-col items-center justify-center overflow-hidden px-4 py-12 sm:px-6';

  return (
    <div className={shell}>
      {!compact && (
        <div
          className={`pointer-events-none absolute inset-0 bg-gradient-to-b ${theme.blob}`}
          aria-hidden
        />
      )}
      {!compact && (
        <div
          className="pointer-events-none absolute -top-24 left-1/2 h-64 w-64 -translate-x-1/2 rounded-full bg-emerald-200/20 blur-3xl"
          aria-hidden
        />
      )}

      <div
        className={`relative z-10 mx-auto w-full max-w-md text-center ${
          compact ? '' : 'rounded-3xl border border-slate-200/80 bg-white/90 p-8 shadow-lg shadow-slate-200/50 backdrop-blur-sm sm:p-10'
        }`}
      >
        <div
          className={`mx-auto flex h-16 w-16 items-center justify-center rounded-2xl ring-8 ${theme.ring}`}
        >
          <Icon size={28} strokeWidth={2} aria-hidden />
        </div>

        {code ? (
          <p className="mt-5 text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
            {code}
          </p>
        ) : null}

        <h1 className={`mt-3 text-xl font-bold tracking-tight text-slate-900 sm:text-2xl`}>
          {title}
        </h1>

        {message ? (
          <p className="mt-3 text-sm leading-relaxed text-slate-600 sm:text-base">
            {message}
          </p>
        ) : null}

        {children ? <div className="mt-4 text-left">{children}</div> : null}

        {actions.length > 0 && (
          <div className="mt-8 flex flex-col gap-2.5 sm:flex-row sm:justify-center">
            {actions.map((action, i) => {
              const primary = action.primary ?? i === 0;
              const className = primary
                ? 'inline-flex items-center justify-center gap-2 rounded-2xl bg-emerald-600 px-5 py-3 text-sm font-semibold text-white shadow-md shadow-emerald-600/20 transition hover:bg-emerald-500'
                : 'inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50';

              if (action.to) {
                return (
                  <Link key={action.label} to={action.to} className={className}>
                    {action.icon}
                    {action.label}
                  </Link>
                );
              }

              return (
                <button
                  key={action.label}
                  type="button"
                  onClick={action.onClick}
                  className={className}
                >
                  {action.icon}
                  {action.label}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

/** Compact inline banner for form / section errors */
export function ErrorBanner({
  title,
  message,
  onRetry,
  onDismiss,
  variant = 'error',
  className = '',
}) {
  const isDark = variant === 'dark';
  return (
    <div
      role="alert"
      className={`flex items-start gap-3 rounded-2xl border px-3.5 py-3 text-left ${
        isDark
          ? 'border-red-400/30 bg-red-500/15 text-red-50'
          : 'border-rose-200 bg-rose-50 text-rose-900'
      } ${className}`}
    >
      <AlertTriangle
        size={18}
        className={`mt-0.5 shrink-0 ${isDark ? 'text-red-200' : 'text-rose-500'}`}
        aria-hidden
      />
      <div className="min-w-0 flex-1">
        {title ? (
          <p className={`text-sm font-semibold ${isDark ? 'text-white' : 'text-rose-900'}`}>
            {title}
          </p>
        ) : null}
        {message ? (
          <p
            className={`text-sm leading-snug ${
              title
                ? isDark
                  ? 'mt-0.5 text-red-100/90'
                  : 'mt-0.5 text-rose-800/90'
                : ''
            }`}
          >
            {message}
          </p>
        ) : null}
        {(onRetry || onDismiss) && (
          <div className="mt-2 flex flex-wrap gap-3">
            {onRetry ? (
              <button
                type="button"
                onClick={onRetry}
                className={`inline-flex items-center gap-1 text-xs font-semibold underline-offset-2 hover:underline ${
                  isDark ? 'text-white' : 'text-rose-800'
                }`}
              >
                <RefreshCw size={12} /> Try again
              </button>
            ) : null}
            {onDismiss ? (
              <button
                type="button"
                onClick={onDismiss}
                className={`text-xs font-medium underline-offset-2 hover:underline ${
                  isDark ? 'text-red-100/80' : 'text-rose-700/80'
                }`}
              >
                Dismiss
              </button>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}

/** Convenience presets for common full-page failures */
export function NotFoundScreen({ homeTo = '/' }) {
  return (
    <ErrorState
      variant="notFound"
      code="404"
      title="Page not found"
      message="That link doesn’t match any screen in SchoolRun. Double-check the URL or head back home."
      actions={[
        {
          label: 'Go home',
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

export function LoadErrorScreen({
  title = 'Something went wrong',
  message = 'We couldn’t load this screen. Check your connection and try again.',
  onRetry,
  homeTo = '/dashboard',
  code,
  variant = 'server',
}) {
  const actions = [];
  if (onRetry) {
    actions.push({
      label: 'Try again',
      onClick: onRetry,
      primary: true,
      icon: <RefreshCw size={16} />,
    });
  }
  actions.push({
    label: 'Back to home',
    to: homeTo,
    primary: !onRetry,
    icon: <Home size={16} />,
  });

  return (
    <ErrorState
      variant={variant}
      code={code}
      title={title}
      message={message}
      actions={actions}
    />
  );
}
