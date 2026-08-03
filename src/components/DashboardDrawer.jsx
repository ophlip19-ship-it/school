import { useEffect } from 'react';
import { Menu, X } from 'lucide-react';

/**
 * Left sidebar drawer for parent dashboard secondary content.
 * Opens via hamburger control; locks body scroll while open on small screens.
 *
 * @param {boolean} props.open
 * @param {() => void} props.onToggle
 * @param {() => void} [props.onClose]
 * @param {React.ReactNode} props.children
 * @param {string} [props.title]
 */
export default function DashboardDrawer({
  open,
  onToggle,
  onClose,
  children,
  title = 'Menu',
}) {
  const close = onClose || onToggle;

  useEffect(() => {
    if (!open) return undefined;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e) => {
      if (e.key === 'Escape') close();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', onKey);
    };
  }, [open, close]);

  return (
    <>
      {open && (
        <button
          type="button"
          aria-label="Close menu"
          className="fixed inset-0 z-40 bg-slate-900/45 backdrop-blur-[2px] transition-opacity lg:bg-slate-900/30"
          onClick={close}
        />
      )}

      <aside
        className={`fixed top-0 left-0 z-50 flex h-full w-[min(88vw,320px)] flex-col bg-white shadow-2xl transition-transform duration-300 ease-out ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
        style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
        role="dialog"
        aria-modal={open}
        aria-label={title}
        aria-hidden={!open}
      >
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3.5 sm:px-5">
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700">
              <Menu size={18} aria-hidden />
            </span>
            <h2 className="text-lg font-bold text-slate-900">{title}</h2>
          </div>
          <button
            type="button"
            onClick={close}
            className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-slate-600 transition hover:bg-slate-200"
            aria-label="Close menu"
          >
            <X size={18} />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-5 sm:px-5">
          {children}
        </div>
      </aside>
    </>
  );
}

/**
 * Hamburger control that opens the left drawer.
 */
export function HamburgerButton({ open, onClick, className = '' }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-expanded={open}
      aria-label={open ? 'Close menu' : 'Open menu'}
      className={`inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 shadow-sm transition hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-800 ${className}`}
    >
      {open ? <X size={22} strokeWidth={2.25} /> : <Menu size={22} strokeWidth={2.25} />}
    </button>
  );
}
