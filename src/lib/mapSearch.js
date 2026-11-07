/**
 * Mapbox Search Box API + Geocoding v6.
 * Search Box covers addresses and POIs (schools). Geocoding v6 is the
 * address-only fallback. Callers pass a token; this module does not read env.
 */

const SEARCH_TYPES = 'poi,address,street,place,locality,neighborhood';
const V6_TYPES = 'address,street,place,locality,neighborhood,district';

function pointFromFeature(feature) {
  const routable = feature?.properties?.coordinates?.routable_points;
  const curb = Array.isArray(routable) ? routable[0] : null;
  if (curb?.longitude != null && curb?.latitude != null) {
    return {
      lng: Number(curb.longitude),
      lat: Number(curb.latitude),
      routable: true,
    };
  }
  if (Array.isArray(feature?.center) && feature.center.length >= 2) {
    return {
      lng: Number(feature.center[0]),
      lat: Number(feature.center[1]),
      routable: false,
    };
  }
  const coords = feature?.geometry?.coordinates;
  if (Array.isArray(coords) && coords.length >= 2 && typeof coords[0] === 'number') {
    return { lng: Number(coords[0]), lat: Number(coords[1]), routable: false };
  }
  const c = feature?.properties?.coordinates;
  if (c?.longitude != null && c?.latitude != null) {
    return { lng: Number(c.longitude), lat: Number(c.latitude), routable: false };
  }
  return null;
}

/** Normalize a Search Box, Geocoding v6, or legacy v5 feature. */
export function placeFromFeature(feature) {
  const point = pointFromFeature(feature);
  if (!point || !Number.isFinite(point.lng) || !Number.isFinite(point.lat)) {
    return null;
  }
  const props = feature.properties || {};
  const name =
    props.name_preferred || props.name || feature.text || '';
  const label =
    props.full_address ||
    feature.place_name ||
    [name, props.place_formatted].filter(Boolean).join(', ') ||
    name ||
    `${point.lat.toFixed(5)}, ${point.lng.toFixed(5)}`;
  return {
    lng: point.lng,
    lat: point.lat,
    label,
    name: name || label.split(',')[0],
    featureType: props.feature_type || feature.place_type?.[0] || '',
    routable: point.routable,
    raw: feature,
  };
}

function placesFromCollection(data) {
  if (!data || data.message) return null;
  const features = data.features || data.results || [];
  return features.map(placeFromFeature).filter(Boolean);
}

async function getJson(url) {
  const res = await fetch(url);
  if (!res.ok) return null;
  return res.json();
}

/**
 * One-shot Search Box text search (addresses + POIs, no session token).
 * Returns places, or null when the request fails.
 */
export async function searchBoxForward(query, options = {}) {
  const q = String(query || '').trim();
  if (!options.token || !q) return null;
  const params = new URLSearchParams({
    q,
    access_token: options.token,
    language: 'en',
    limit: String(options.limit ?? 5),
    country: options.country || 'ng',
    types: options.types || SEARCH_TYPES,
    autocomplete: 'true',
  });
  if (options.proximity) params.set('proximity', options.proximity);
  try {
    const data = await getJson(
      `https://api.mapbox.com/search/searchbox/v1/forward?${params}`,
    );
    return placesFromCollection(data);
  } catch {
    return null;
  }
}

/** Search Box reverse: nearest address or POI. */
export async function searchBoxReverse(lng, lat, token) {
  if (!token || lng == null || lat == null) return null;
  const params = new URLSearchParams({
    longitude: String(lng),
    latitude: String(lat),
    access_token: token,
    language: 'en',
    limit: '1',
    types: 'poi,address,street',
  });
  try {
    const data = await getJson(
      `https://api.mapbox.com/search/searchbox/v1/reverse?${params}`,
    );
    return placesFromCollection(data)?.[0] || null;
  } catch {
    return null;
  }
}

/** Interactive suggest. Requires a stable session_token until retrieve. */
export async function searchBoxSuggest(query, options = {}) {
  const q = String(query || '').trim();
  if (!options.token || !options.sessionToken || q.length < 2) return [];
  const params = new URLSearchParams({
    q,
    access_token: options.token,
    session_token: options.sessionToken,
    language: 'en',
    limit: String(options.limit ?? 6),
    country: options.country || 'ng',
    types: options.types || SEARCH_TYPES,
  });
  if (options.proximity) params.set('proximity', options.proximity);
  try {
    const data = await getJson(
      `https://api.mapbox.com/search/searchbox/v1/suggest?${params}`,
    );
    return Array.isArray(data?.suggestions) ? data.suggestions : [];
  } catch {
    return [];
  }
}

/** Resolve a suggest result to coordinates. Ends the Search Box session. */
export async function searchBoxRetrieve(mapboxId, options = {}) {
  if (!options.token || !options.sessionToken || !mapboxId) return null;
  const params = new URLSearchParams({
    access_token: options.token,
    session_token: options.sessionToken,
    language: 'en',
  });
  try {
    const data = await getJson(
      `https://api.mapbox.com/search/searchbox/v1/retrieve/${encodeURIComponent(mapboxId)}?${params}`,
    );
    return placesFromCollection(data)?.[0] || null;
  } catch {
    return null;
  }
}

/** Geocoding v6 forward (addresses, streets, places — no POIs). */
export async function geocodeV6Forward(query, options = {}) {
  const q = String(query || '').trim();
  if (!options.token || !q) return null;
  const params = new URLSearchParams({
    q,
    access_token: options.token,
    language: 'en',
    limit: String(options.limit ?? 5),
    country: options.country || 'ng',
    types: options.types || V6_TYPES,
    autocomplete: 'true',
  });
  if (options.proximity) params.set('proximity', options.proximity);
  try {
    const data = await getJson(
      `https://api.mapbox.com/search/geocode/v6/forward?${params}`,
    );
    return placesFromCollection(data);
  } catch {
    return null;
  }
}

/** Geocoding v6 reverse label, or null. */
export async function geocodeV6Reverse(lng, lat, token) {
  if (!token || lng == null || lat == null) return null;
  const params = new URLSearchParams({
    longitude: String(lng),
    latitude: String(lat),
    access_token: token,
    language: 'en',
    limit: '1',
    types: 'address,street,neighborhood,place',
  });
  try {
    const data = await getJson(
      `https://api.mapbox.com/search/geocode/v6/reverse?${params}`,
    );
    return placesFromCollection(data)?.[0]?.label || null;
  } catch {
    return null;
  }
}
