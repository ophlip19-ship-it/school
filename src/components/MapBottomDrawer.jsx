import { ChevronDown, ChevronUp } from 'lucide-react';

/**
 * Full-screen map companion: collapsible bottom drawer for ride / trip details.
 *
 * @param {object} props
 * @param {boolean} props.open
 * @param {() => void} props.onToggle
 * @param {React.ReactNode} [props.summary] — always-visible peek bar content
 * @param {React.ReactNode} props.children — expanded body
 * @param {string} [props.className]
 * @param {string} [props.maxHeight] — CSS max-height when open (default 58vh)
 */
export default function MapBottomDrawer({
  open,
  onToggle,
  summary,
  children,
  className = '',
  maxHeight = '58vh',
}) {
  return (
    <div
      className={`absolute bottom-0 left-0 right-0 z-20 flex flex-col rounded-t-3xl bg-white shadow-[0_-8px_30px_rgba(15,23,42,0.18)] transition-[max-height] duration-300 ease-out ${className}`}
      style={{ maxHeight: open ? maxHeight : 'auto' }}
    >
      {/* Grab handle + toggle */}
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        aria-label={open ? 'Collapse trip details' : 'Expand trip details'}
        className="flex w-full flex-col items-center px-4 pt-2 pb-1"
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
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-6 pt-1">
          {children}
        </div>
      )}
    </div>
  );
}
