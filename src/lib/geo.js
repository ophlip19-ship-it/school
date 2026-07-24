/** Default anchors (Lagos) used when geolocation/geocoding is unavailable */
export const DEFAULT_HOME = {
  label: 'Home · 12 Admiralty Way, Lekki',
  lng: 3.4734,
  lat: 6.4474,
};

export const DEFAULT_SCHOOL = {
  label: 'Greenfield School · Victoria Island',
  lng: 3.4219,
  lat: 6.4281,
};

/**
 * Typical urban driving speed used to convert road distance (km) → ETA.
 * Override with VITE_AVG_SPEED_KMH if needed.
 */
export const DEFAULT_AVG_SPEED_KMH = Number(import.meta.env.VITE_AVG_SPEED_KMH) || 30;

export function mapboxToken() {
  return import.meta.env.VITE_MAPBOX_TOKEN || '';
}

/** Great-circle distance in kilometers between two lng/lat points */
export function haversineKm(a, b) {
  if (
    a?.lng == null ||
    a?.lat == null ||
    b?.lng == null ||
    b?.lat == null
  ) {
    return null;
  }
  const toRad = (d) => (d * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

/**
 * ETA minutes from road/straight-line distance in km.
 * Uses constant average speed so time scales with actual kilometers.
 */
export function etaMinutesFromKm(distanceKm, avgSpeedKmh = DEFAULT_AVG_SPEED_KMH) {
  const km = Number(distanceKm);
  const speed = Number(avgSpeedKmh) || DEFAULT_AVG_SPEED_KMH;
  if (!Number.isFinite(km) || km < 0 || speed <= 0) return null;
  return (km / speed) * 60;
}

export function formatDistanceKm(distanceKm) {
  const km = Number(distanceKm);
  if (!Number.isFinite(km)) return '';
  if (km < 0.1) return `${Math.round(km * 1000)} m`;
  return `${km.toFixed(km < 10 ? 1 : 0)} km`;
}

export function formatEtaMinutes(minutes) {
  const m = Number(minutes);
  if (!Number.isFinite(m) || m < 0) return '—';
  if (m < 1) return '< 1 min';
  if (m < 60) return `${Math.round(m)} min`;
  const h = Math.floor(m / 60);
  const rem = Math.round(m % 60);
  return rem ? `${h} h ${rem} min` : `${h} h`;
}

/**
 * Fetch a driving route from Mapbox Directions.
 * Returns road distance (km), ETA from km @ avg speed, geometry, and turn steps.
 *
 * @param {{lng:number,lat:number}|[number,number]} from
 * @param {{lng:number,lat:number}|[number,number]} to
 * @param {{ token?: string, steps?: boolean, profile?: string }} [options]
 */
export async function fetchDrivingRoute(from, to, options = {}) {
  const token = options.token || mapboxToken();
  const profile = options.profile || 'mapbox/driving';
  const wantSteps = options.steps !== false;

  const normalize = (p) => {
    if (Array.isArray(p) && p.length >= 2) return { lng: p[0], lat: p[1] };
    if (p?.lng != null && p?.lat != null) return { lng: p.lng, lat: p.lat };
    return null;
  };

  const a = normalize(from);
  const b = normalize(to);
  if (!a || !b) return null;

  // Fallback when Mapbox is unavailable: straight-line distance + km-based ETA
  const straightKm = haversineKm(a, b);
  const fallback = () => {
    if (straightKm == null) return null;
    const etaMin = etaMinutesFromKm(straightKm);
    return {
      distanceM: straightKm * 1000,
      distanceKm: straightKm,
      durationS: etaMin != null ? etaMin * 60 : null,
      etaMinutes: etaMin,
      geometry: {
        type: 'LineString',
        coordinates: [
          [a.lng, a.lat],
          [b.lng, b.lat],
        ],
      },
      steps: [],
      nextStep: null,
      source: 'haversine',
    };
  };

  if (!token) return fallback();

  try {
    const coords = `${a.lng},${a.lat};${b.lng},${b.lat}`;
    const params = new URLSearchParams({
      geometries: 'geojson',
      overview: 'full',
      steps: wantSteps ? 'true' : 'false',
      access_token: token,
    });
    const url = `https://api.mapbox.com/directions/v5/${profile}/${coords}?${params}`;
    const res = await fetch(url);
    const data = await res.json();
    const route = data.routes?.[0];
    if (!route) return fallback();

    const distanceM = route.distance ?? 0;
    const distanceKm = distanceM / 1000;
    const etaMinutes = etaMinutesFromKm(distanceKm);

    const steps = [];
    for (const leg of route.legs || []) {
      for (const step of leg.steps || []) {
        const maneuver = step.maneuver || {};
        steps.push({
          instruction:
            maneuver.instruction ||
            step.name ||
            (maneuver.type ? String(maneuver.type).replace(/_/g, ' ') : 'Continue'),
          type: maneuver.type || 'continue',
          modifier: maneuver.modifier || null,
          distanceM: step.distance ?? 0,
          distanceKm: (step.distance ?? 0) / 1000,
          durationS: step.duration ?? 0,
          location: Array.isArray(maneuver.location)
            ? { lng: maneuver.location[0], lat: maneuver.location[1] }
            : null,
          name: step.name || '',
        });
      }
    }

    // First actionable step after depart
    const nextStep =
      steps.find((s) => s.type !== 'depart' && s.type !== 'arrive') ||
      steps[0] ||
      null;

    return {
      distanceM,
      distanceKm,
      durationS: route.duration ?? null,
      /** ETA derived from road distance (km) ÷ average urban speed */
      etaMinutes,
      geometry: route.geometry,
      steps,
      nextStep,
      source: 'mapbox',
    };
  } catch {
    return fallback();
  }
}

/**
 * Pick the upcoming turn based on current GPS vs step locations.
 */
export function pickNextStep(steps, current, arriveThresholdM = 25) {
  if (!Array.isArray(steps) || !steps.length || !current) {
    return steps?.[0] || null;
  }
  let best = null;
  let bestDist = Infinity;
  for (const step of steps) {
    if (!step.location || step.type === 'depart') continue;
    const dKm = haversineKm(current, step.location);
    if (dKm == null) continue;
    const dM = dKm * 1000;
    // Prefer the nearest step still ahead (not already passed within threshold)
    if (dM < bestDist) {
      bestDist = dM;
      best = step;
    }
  }
  if (best && bestDist <= arriveThresholdM && best.type === 'arrive') {
    return best;
  }
  // If we're very close to a non-arrive step, advance to the following one
  if (best && bestDist < arriveThresholdM) {
    const idx = steps.indexOf(best);
    return steps[idx + 1] || best;
  }
  return best || steps[0];
}

/**
 * Browser GPS → { lng, lat, accuracy }
 */
export function getCurrentPosition(options = {}) {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Geolocation is not supported on this device'));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        resolve({
          lng: pos.coords.longitude,
          lat: pos.coords.latitude,
          accuracy: pos.coords.accuracy,
          heading: pos.coords.heading ?? 0,
        });
      },
      (err) => reject(err),
      {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 10000,
        ...options,
      },
    );
  });
}

/**
 * Watch GPS and call onUpdate; returns cleanup fn.
 */
export function watchPosition(onUpdate, onError) {
  if (!navigator.geolocation) {
    onError?.(new Error('Geolocation is not supported'));
    return () => {};
  }
  const id = navigator.geolocation.watchPosition(
    (pos) => {
      onUpdate({
        lng: pos.coords.longitude,
        lat: pos.coords.latitude,
        accuracy: pos.coords.accuracy,
        heading: pos.coords.heading ?? 0,
      });
    },
    (err) => onError?.(err),
    { enableHighAccuracy: true, timeout: 20000, maximumAge: 3000 },
  );
  return () => navigator.geolocation.clearWatch(id);
}

export async function reverseGeocode(lng, lat, token = mapboxToken()) {
  if (!token) return `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
  try {
    const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${lng},${lat}.json?limit=1&access_token=${token}`;
    const res = await fetch(url);
    const data = await res.json();
    return data.features?.[0]?.place_name || `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
  } catch {
    return `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
  }
}

export async function forwardGeocode(query, token = mapboxToken()) {
  if (!token || !query?.trim()) return null;
  try {
    const q = encodeURIComponent(query.trim());
    const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${q}.json?limit=1&access_token=${token}`;
    const res = await fetch(url);
    const data = await res.json();
    const f = data.features?.[0];
    if (!f?.center) return null;
    return {
      lng: f.center[0],
      lat: f.center[1],
      label: f.place_name,
    };
  } catch {
    return null;
  }
}

/**
 * Resolve pickup: home | current | custom text
 */
export async function resolvePickup({
  mode,
  homeAddress,
  homeCoords,
  customLabel,
  customCoords,
}) {
  if (mode === 'home') {
    const label = homeAddress || DEFAULT_HOME.label;
    if (homeCoords?.lng != null && homeCoords?.lat != null) {
      return { label, lng: homeCoords.lng, lat: homeCoords.lat };
    }
    const geo = await forwardGeocode(label);
    return {
      label,
      lng: geo?.lng ?? DEFAULT_HOME.lng,
      lat: geo?.lat ?? DEFAULT_HOME.lat,
    };
  }

  if (mode === 'current') {
    const pos = await getCurrentPosition();
    const place = await reverseGeocode(pos.lng, pos.lat);
    return {
      label: `Current location · ${place}`,
      lng: pos.lng,
      lat: pos.lat,
    };
  }

  // custom
  if (customCoords?.lng != null && customCoords?.lat != null) {
    return {
      label: customLabel || 'Custom pickup',
      lng: customCoords.lng,
      lat: customCoords.lat,
    };
  }
  const geo = await forwardGeocode(customLabel || DEFAULT_HOME.label);
  return {
    label: customLabel || geo?.label || DEFAULT_HOME.label,
    lng: geo?.lng ?? DEFAULT_HOME.lng,
    lat: geo?.lat ?? DEFAULT_HOME.lat,
  };
}

/**
 * Resolve destination: school | custom
 */
export async function resolveDestination({
  mode,
  schoolName,
  customLabel,
  customCoords,
}) {
  if (mode === 'school') {
    const label = schoolName
      ? `${schoolName} · main gate`
      : DEFAULT_SCHOOL.label;
    const geo = await forwardGeocode(schoolName || DEFAULT_SCHOOL.label);
    return {
      label,
      lng: geo?.lng ?? DEFAULT_SCHOOL.lng,
      lat: geo?.lat ?? DEFAULT_SCHOOL.lat,
    };
  }

  if (customCoords?.lng != null && customCoords?.lat != null) {
    return {
      label: customLabel || 'Custom destination',
      lng: customCoords.lng,
      lat: customCoords.lat,
    };
  }
  const geo = await forwardGeocode(customLabel || DEFAULT_SCHOOL.label);
  return {
    label: customLabel || geo?.label || DEFAULT_SCHOOL.label,
    lng: geo?.lng ?? DEFAULT_SCHOOL.lng,
    lat: geo?.lat ?? DEFAULT_SCHOOL.lat,
  };
}
