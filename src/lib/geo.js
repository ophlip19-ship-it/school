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

export function mapboxToken() {
  return import.meta.env.VITE_MAPBOX_TOKEN || '';
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
