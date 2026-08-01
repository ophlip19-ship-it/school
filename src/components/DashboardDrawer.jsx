import { useEffect } from 'react';
import { ChevronDown, ChevronUp, X } from 'lucide-react';

/**
 * Mobile secondary panel for parent dashboard (bottom sheet).
 * On md+ screens, content is expected to render inline — this is mobile-only.
 *
 * @param {boolean} props.open
 * @param {() => void} props.onToggle
 * @param {() => void} [props.onClose]
 * @param {React.ReactNode} props.summary — collapsed peek bar
 * @param {React.ReactNode} props.children
 * @param {string} [props.title]
 */
export default function DashboardDrawer({
  open,
  onToggle,
  onClose,
  summary,
  children,
  title = 'More',
}) {
  // Lock body scroll when fully open on small screens
  useEffect(() => {
    if (!open) return undefined;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  return (
    <>
      {/* Dim overlay when expanded */}
      {open && (
        <button
          type="button"
          aria-label="Close drawer"
          className="fixed inset-0 z-40 bg-slate-900/40 md:hidden"
          onClick={onClose || onToggle}
        />
      )}

      <div
        className={`fixed bottom-0 left-0 right-0 z-50 flex flex-col rounded-t-3xl bg-white shadow-[0_-12px_40px_rgba(15,23,42,0.2)] transition-[height,max-height] duration-300 ease-out md:hidden ${
          open ? 'h-[min(78vh,640px)]' : 'h-auto'
        }`}
        style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
        role="dialog"
        aria-modal={open}
        aria-label={title}
      >
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          aria-label={open ? 'Collapse secondary panel' : 'Expand secondary panel'}
          className="flex w-full flex-col items-center px-4 pt-2.5 pb-2"
        >
          <span className="mb-2 h-1.5 w-12 rounded-full bg-slate-300" />
          <div className="flex w-full items-center gap-2 text-left">
            <div className="min-w-0 flex-1">{summary}</div>
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-600">
              {open ? <ChevronDown size={18} /> : <ChevronUp size={18} />}
            </span>
          </div>
        </button>

        {open && (
          <div className="relative min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-24 pt-1 sm:px-5">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-lg font-bold text-slate-900">{title}</h2>
              <button
                type="button"
                onClick={onClose || onToggle}
                className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-slate-600 hover:bg-slate-200"
                aria-label="Close"
              >
                <X size={18} />
              </button>
            </div>
            {children}
          </div>
        )}
      </div>
    </>
  );
}
