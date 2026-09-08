import { ChevronLeft, ChevronRight } from 'lucide-react';
import { monthGrid, monthTitle, todayKey } from '../lib/schedule.js';

const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/**
 * Month calendar. selectedKeys: Set/array of YYYY-MM-DD.
 * marked: { [dateKey]: number | true } — dots for scheduled rides.
 */
export default function RideCalendar({
  year,
  month,
  onPrev,
  onNext,
  selectedKeys = [],
  marked = {},
  onSelectDate,
  minKey = null,
}) {
  const cells = monthGrid(year, month);
  const today = todayKey();
  const selected = selectedKeys instanceof Set ? selectedKeys : new Set(selectedKeys);

  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <button
          type="button"
          onClick={onPrev}
          className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-slate-700 hover:bg-slate-200"
          aria-label="Previous month"
        >
          <ChevronLeft size={18} />
        </button>
        <p className="text-sm font-bold text-slate-900">{monthTitle(year, month)}</p>
        <button
          type="button"
          onClick={onNext}
          className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-slate-700 hover:bg-slate-200"
          aria-label="Next month"
        >
          <ChevronRight size={18} />
        </button>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-semibold uppercase tracking-wide text-slate-400">
        {DOW.map((d) => (
          <div key={d} className="py-1">
            {d}
          </div>
        ))}
      </div>
      <div className="mt-1 grid grid-cols-7 gap-1">
        {cells.map((cell, i) => {
          if (!cell) {
            return <div key={`e-${i}`} className="h-10" />;
          }
          const isToday = cell.key === today;
          const isSelected = selected.has(cell.key);
          const markCount = Number(marked[cell.key] || 0);
          const disabled = minKey && cell.key < minKey;
          return (
            <button
              key={cell.key}
              type="button"
              disabled={disabled || !onSelectDate}
              onClick={() => onSelectDate?.(cell.key)}
              className={`relative flex h-10 flex-col items-center justify-center rounded-xl text-sm font-semibold transition ${
                disabled
                  ? 'cursor-not-allowed text-slate-300'
                  : isSelected
                    ? 'bg-emerald-600 text-white shadow-sm'
                    : isToday
                      ? 'bg-emerald-50 text-emerald-800'
                      : onSelectDate
                        ? 'text-slate-800 hover:bg-slate-100'
                        : 'text-slate-800'
              }`}
            >
              {cell.day}
              {markCount > 0 && !isSelected ? (
                <span className="absolute bottom-1 h-1 w-1 rounded-full bg-emerald-500" />
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}
