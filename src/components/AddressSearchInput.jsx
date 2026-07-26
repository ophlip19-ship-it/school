import { useEffect, useId, useRef, useState } from 'react';
import { MapPin, Search, Loader2 } from 'lucide-react';
import { searchDestinations } from '../lib/addressDatabase';

/**
 * Destination / place search with local address DB filter + Mapbox fallback.
 *
 * @param {object} props
 * @param {string} props.value
 * @param {(value: string) => void} props.onChange
 * @param {(place: { label: string, lng: number, lat: number, name?: string, source?: string }) => void} [props.onSelect]
 * @param {string} [props.placeholder]
 * @param {string} [props.className]
 * @param {string} [props.inputClassName]
 * @param {string[]} [props.types]
 * @param {boolean} [props.dark] — style for dark panels (instant ride card)
 */
export default function AddressSearchInput({
  value,
  onChange,
  onSelect,
  placeholder = 'Search address, school, or landmark…',
  className = '',
  inputClassName = '',
  types,
  dark = false,
}) {
  const listId = useId();
  const wrapRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState([]);
  const debounceRef = useRef(null);

  useEffect(() => {
    const q = (value || '').trim();
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (q.length < 1) {
      setResults([]);
      setLoading(false);
      return undefined;
    }

    setLoading(true);
    debounceRef.current = setTimeout(async () => {
      try {
        const list = await searchDestinations(q, { limit: 8, types });
        setResults(list);
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 220);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [value, types]);

  useEffect(() => {
    const onDoc = (e) => {
      if (!wrapRef.current?.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  const pick = (item) => {
    onChange?.(item.label);
    onSelect?.({
      label: item.label,
      lng: item.lng,
      lat: item.lat,
      name: item.name,
      source: item.source,
    });
    setOpen(false);
  };

  const shell = dark
    ? 'rounded-xl border-0 bg-white/95 text-slate-900'
    : 'rounded-2xl border border-slate-200 bg-white text-slate-900';

  return (
    <div ref={wrapRef} className={`relative ${className}`}>
      <div className={`flex items-center gap-2 px-3 ${shell} ${inputClassName}`}>
        {loading ? (
          <Loader2 size={16} className="shrink-0 animate-spin text-slate-400" />
        ) : (
          <Search size={16} className="shrink-0 text-slate-400" />
        )}
        <input
          value={value}
          onChange={(e) => {
            onChange?.(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          placeholder={placeholder}
          autoComplete="off"
          role="combobox"
          aria-expanded={open && results.length > 0}
          aria-controls={listId}
          className="w-full bg-transparent py-2.5 text-sm outline-none placeholder:text-slate-400"
        />
      </div>

      {open && (results.length > 0 || (value.trim() && !loading)) && (
        <ul
          id={listId}
          role="listbox"
          className="absolute z-50 mt-1 max-h-56 w-full overflow-y-auto rounded-2xl border border-slate-200 bg-white py-1 shadow-lg"
        >
          {results.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                role="option"
                onClick={() => pick(item)}
                className="flex w-full items-start gap-2 px-3 py-2.5 text-left hover:bg-emerald-50"
              >
                <MapPin size={14} className="mt-0.5 shrink-0 text-emerald-600" />
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium text-slate-900">
                    {item.name || item.label}
                  </span>
                  <span className="block truncate text-xs text-slate-500">
                    {item.area ? `${item.area} · ` : ''}
                    {item.type}
                    {item.source === 'mapbox' ? ' · map' : ''}
                  </span>
                </span>
              </button>
            </li>
          ))}
          {results.length === 0 && value.trim() && !loading && (
            <li className="px-3 py-2.5 text-sm text-slate-500">
              No matches in address book. Keep typing or use map search.
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
