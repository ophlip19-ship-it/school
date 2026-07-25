import MapboxGeocoder from '@mapbox/mapbox-gl-geocoder';
import mapboxgl from 'mapbox-gl';
import '@mapbox/mapbox-gl-geocoder/dist/mapbox-gl-geocoder.css';
import { DEFAULT_HOME, mapboxToken } from './geo';

/** Lagos metro bias for search ranking */
export const GEOCODER_PROXIMITY = {
  longitude: DEFAULT_HOME.lng,
  latitude: DEFAULT_HOME.lat,
};

/**
 * Create a Mapbox Geocoder control for location search & filter.
 * Biased toward Lagos / Nigeria school-run usage.
 *
 * @param {object} [options]
 * @param {string} [options.placeholder]
 * @param {boolean} [options.marker] — show a pin on result (default false)
 * @param {string} [options.countries] — ISO country codes (default 'ng')
 * @param {{longitude:number,latitude:number}} [options.proximity]
 * @param {string} [options.types]
 * @param {number} [options.limit]
 * @param {string} [options.accessToken]
 */
export function createMapGeocoder(options = {}) {
  const accessToken = options.accessToken || mapboxToken();
  if (!accessToken) {
    throw new Error('Mapbox token required for geocoder');
  }

  return new MapboxGeocoder({
    accessToken,
    mapboxgl,
    marker: options.marker === true,
    placeholder: options.placeholder || 'Search location…',
    countries: options.countries ?? 'ng',
    proximity: options.proximity || GEOCODER_PROXIMITY,
    types:
      options.types ||
      'address,poi,place,locality,neighborhood,district',
    limit: options.limit ?? 6,
    clearOnBlur: false,
    collapsed: false,
    ...(options.extra && typeof options.extra === 'object' ? options.extra : {}),
  });
}

/**
 * Attach a geocoder to a map instance and wire result/clear handlers.
 * Returns a cleanup function.
 *
 * @param {mapboxgl.Map} map
 * @param {object} [opts]
 * @param {'top-left'|'top-right'|'bottom-left'|'bottom-right'} [opts.position]
 * @param {(result:{label:string,lng:number,lat:number,raw:object})=>void} [opts.onResult]
 * @param {()=>void} [opts.onClear]
 * @param {string} [opts.placeholder]
 * @param {boolean} [opts.flyTo]
 * @param {boolean} [opts.marker]
 */
export function attachMapGeocoder(map, opts = {}) {
  if (!map) return () => {};

  const geocoder = createMapGeocoder({
    placeholder: opts.placeholder,
    marker: opts.marker,
    countries: opts.countries,
    proximity: opts.proximity,
    types: opts.types,
    limit: opts.limit,
    accessToken: opts.accessToken,
    extra: {
      flyTo: opts.flyTo === false ? false : opts.flyTo ?? true,
    },
  });

  const position = opts.position || 'top-left';
  map.addControl(geocoder, position);

  const onResult = (e) => {
    const feature = e?.result;
    if (!feature?.center) return;
    const [lng, lat] = feature.center;
    const label =
      feature.place_name ||
      feature.text ||
      `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
    opts.onResult?.({
      label,
      lng,
      lat,
      raw: feature,
    });
  };

  const onClear = () => {
    opts.onClear?.();
  };

  geocoder.on('result', onResult);
  geocoder.on('clear', onClear);

  return () => {
    try {
      geocoder.off('result', onResult);
      geocoder.off('clear', onClear);
      map.removeControl(geocoder);
    } catch {
      /* map may already be removed */
    }
  };
}

/**
 * Normalize a Mapbox Geocoding feature into { label, lng, lat }.
 */
export function featureToPlace(feature) {
  if (!feature?.center) return null;
  return {
    label: feature.place_name || feature.text || 'Selected location',
    lng: feature.center[0],
    lat: feature.center[1],
  };
}
