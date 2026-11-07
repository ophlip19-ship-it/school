import { DEFAULT_HOME, mapboxToken } from './geo';
import { filterAddressDatabase } from './addressDatabase';
import {
  placeFromFeature,
  searchBoxRetrieve,
  searchBoxSuggest,
} from './mapSearch';

/** Lagos metro bias for search ranking */
export const GEOCODER_PROXIMITY = {
  longitude: DEFAULT_HOME.lng,
  latitude: DEFAULT_HOME.lat,
};

function sessionToken() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `sr-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

/**
 * Local hits shaped like the old geocoder localGeocoder (GeoJSON features).
 */
export function localAddressGeocoder(query) {
  const hits = filterAddressDatabase(query, { limit: 6 });
  return hits.map((entry) => ({
    type: 'Feature',
    id: entry.id,
    place_name: entry.label,
    text: entry.name,
    center: [entry.lng, entry.lat],
    geometry: {
      type: 'Point',
      coordinates: [entry.lng, entry.lat],
    },
    properties: {
      source: 'schoolrun-address-db',
      type: entry.type,
      area: entry.area,
    },
    place_type: [entry.type || 'poi'],
  }));
}

function proximityParam(map, override) {
  if (override?.longitude != null && override?.latitude != null) {
    return `${override.longitude},${override.latitude}`;
  }
  try {
    const c = map?.getCenter?.();
    if (c) return `${c.lng},${c.lat}`;
  } catch {
    /* map gone */
  }
  return `${GEOCODER_PROXIMITY.longitude},${GEOCODER_PROXIMITY.latitude}`;
}

/**
 * Map control: local address book + Mapbox Search Box suggest/retrieve.
 * Search Box is the current autocomplete API (POIs and addresses).
 */
class SearchBoxControl {
  constructor(options = {}) {
    this.options = options;
    this._map = null;
    this._container = null;
    this._input = null;
    this._list = null;
    this._clearBtn = null;
    this._session = sessionToken();
    this._timer = null;
    this._abort = 0;
    this._items = [];
    this._onDocPointer = (event) => {
      if (!this._container?.contains(event.target)) this._hideList();
    };
  }

  onAdd(map) {
    this._map = map;
    const root = document.createElement('div');
    root.className = 'mapboxgl-ctrl mapboxgl-ctrl-geocoder';

    const icon = document.createElement('span');
    icon.className = 'mapboxgl-ctrl-geocoder--icon-search';
    icon.setAttribute('aria-hidden', 'true');
    icon.innerHTML =
      '<svg viewBox="0 0 18 18" width="18" height="18" fill="none" stroke="#64748b" stroke-width="2"><circle cx="8" cy="8" r="5.5"/><path d="M12.5 12.5L16 16" stroke-linecap="round"/></svg>';

    const input = document.createElement('input');
    input.type = 'search';
    input.className = 'mapboxgl-ctrl-geocoder--input';
    input.placeholder = this.options.placeholder || 'Search location…';
    input.autocomplete = 'off';
    input.spellcheck = false;
    input.setAttribute('aria-label', input.placeholder);

    const clearBtn = document.createElement('button');
    clearBtn.type = 'button';
    clearBtn.className = 'mapboxgl-ctrl-geocoder--button';
    clearBtn.setAttribute('aria-label', 'Clear search');
    clearBtn.textContent = '×';
    clearBtn.hidden = true;

    const list = document.createElement('div');
    list.className = 'suggestions';
    list.hidden = true;

    root.append(icon, input, clearBtn, list);
    root.addEventListener('mousedown', (event) => event.stopPropagation());
    root.addEventListener('click', (event) => event.stopPropagation());

    input.addEventListener('input', () => {
      clearBtn.hidden = !input.value;
      this._schedule(input.value);
    });
    input.addEventListener('focus', () => {
      if (this._items.length) list.hidden = false;
    });
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        this._hideList();
        input.blur();
      } else if (event.key === 'Enter' && this._items[0]) {
        event.preventDefault();
        this._choose(this._items[0]);
      }
    });
    clearBtn.addEventListener('click', () => {
      input.value = '';
      clearBtn.hidden = true;
      this._items = [];
      this._hideList();
      this._session = sessionToken();
      this.options.onClear?.();
      input.focus();
    });

    this._container = root;
    this._input = input;
    this._list = list;
    this._clearBtn = clearBtn;
    document.addEventListener('pointerdown', this._onDocPointer);
    return root;
  }

  onRemove() {
    document.removeEventListener('pointerdown', this._onDocPointer);
    if (this._timer) clearTimeout(this._timer);
    this._abort += 1;
    this._container?.remove();
    this._map = null;
    this._container = null;
  }

  _hideList() {
    if (this._list) this._list.hidden = true;
  }

  _schedule(value) {
    if (this._timer) clearTimeout(this._timer);
    const q = value.trim();
    if (!q) {
      this._items = [];
      this._hideList();
      return;
    }
    this._timer = setTimeout(() => {
      this._search(q);
    }, 280);
  }

  async _search(q) {
    const token = this._abort + 1;
    this._abort = token;
    const local = (this.options.localGeocoder || localAddressGeocoder)(q).map(
      (feature) => ({
        kind: 'local',
        title: feature.text || feature.place_name,
        subtitle: feature.properties?.area || 'Saved place',
        feature,
      }),
    );

    let remote = [];
    if (q.length >= 2 && this.options.localGeocoderOnly !== true) {
      const accessToken = this.options.accessToken || mapboxToken();
      const suggestions = await searchBoxSuggest(q, {
        token: accessToken,
        sessionToken: this._session,
        proximity: proximityParam(this._map, this.options.proximity),
        country: this.options.countries || 'ng',
        limit: this.options.limit ?? 6,
        types: this.options.types,
      });
      if (this._abort !== token) return;
      const localNames = new Set(
        local.map((item) => String(item.title || '').toLowerCase()),
      );
      remote = suggestions
        .filter((s) => s?.mapbox_id && s.feature_type !== 'category')
        .filter((s) => !localNames.has(String(s.name || '').toLowerCase()))
        .map((s) => ({
          kind: 'mapbox',
          title: s.name || s.full_address || 'Place',
          subtitle: s.full_address || s.place_formatted || s.feature_type || '',
          suggestion: s,
        }));
    }

    if (this._abort !== token) return;
    this._items = [...local, ...remote].slice(0, 8);
    this._renderList();
  }

  _renderList() {
    const list = this._list;
    if (!list) return;
    list.replaceChildren();
    if (!this._items.length) {
      list.hidden = true;
      return;
    }
    for (const item of this._items) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'mapboxgl-ctrl-geocoder--suggestion';

      const title = document.createElement('span');
      title.className = 'mapboxgl-ctrl-geocoder--suggestion-title';
      title.textContent = item.title;

      const meta = document.createElement('span');
      meta.className = 'mapboxgl-ctrl-geocoder--suggestion-address';
      meta.textContent =
        item.kind === 'local' ? `${item.subtitle} · saved` : item.subtitle;

      button.append(title, meta);
      button.addEventListener('click', () => this._choose(item));
      list.appendChild(button);
    }
    list.hidden = false;
  }

  async _choose(item) {
    this._hideList();
    let place = null;
    if (item.kind === 'local') {
      place = placeFromFeature(item.feature);
    } else if (item.suggestion?.mapbox_id) {
      const accessToken = this.options.accessToken || mapboxToken();
      const session = this._session;
      this._session = sessionToken();
      place = await searchBoxRetrieve(item.suggestion.mapbox_id, {
        token: accessToken,
        sessionToken: session,
      });
    }
    if (!place || !this._map) return;
    if (this._input) this._input.value = place.label;
    if (this._clearBtn) this._clearBtn.hidden = false;
    if (this.options.flyTo !== false) {
      this._map.flyTo({
        center: [place.lng, place.lat],
        zoom: Math.max(this._map.getZoom(), 15),
        essential: true,
      });
    }
    this.options.onResult?.({
      label: place.label,
      lng: place.lng,
      lat: place.lat,
      raw: place.raw || item.feature || null,
    });
  }
}

/**
 * Attach Search Box + local address search to a map.
 * Returns a cleanup function.
 */
export function attachMapGeocoder(map, opts = {}) {
  if (!map) return () => {};
  if (!mapboxToken() && !opts.accessToken) return () => {};

  const control = new SearchBoxControl({
    placeholder: opts.placeholder,
    marker: opts.marker,
    countries: opts.countries,
    proximity: opts.proximity,
    types: opts.types,
    limit: opts.limit,
    accessToken: opts.accessToken,
    flyTo: opts.flyTo,
    onResult: opts.onResult,
    onClear: opts.onClear,
    localGeocoder: opts.localGeocoder,
    localGeocoderOnly: opts.localGeocoderOnly,
  });
  map.addControl(control, opts.position || 'top-left');
  return () => {
    try {
      map.removeControl(control);
    } catch {
      /* map may already be removed */
    }
  };
}

/** Normalize a search feature into { label, lng, lat }. */
export function featureToPlace(feature) {
  const place = placeFromFeature(feature);
  if (!place) return null;
  return { label: place.label, lng: place.lng, lat: place.lat };
}
