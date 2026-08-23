import { useEffect, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import {
  DEFAULT_HOME,
  fetchDrivingRoute,
  hasLngLat,
  mapboxToken,
} from '../lib/geo';

/**
 * Compact two-pin map (pickup + drop-off) with an optional driving route.
 * Used on payment and review screens so the child's school pin and home pin
 * are visible before pay / live tracking.
 */
export default function TripRouteMap({
  pickup,
  dropoff,
  className = 'h-48',
}) {
  const container = useRef(null);
  const map = useRef(null);
  const pickupMarker = useRef(null);
  const dropoffMarker = useRef(null);
  const [ready, setReady] = useState(false);
  const [missingToken, setMissingToken] = useState(false);

  const from = hasLngLat(pickup) ? pickup : null;
  const to = hasLngLat(dropoff) ? dropoff : null;

  useEffect(() => {
    const token = mapboxToken();
    if (!token) {
      setMissingToken(true);
      return undefined;
    }
    if (!container.current || map.current) return undefined;

    mapboxgl.accessToken = token;
    const start = from
      ? [from.lng, from.lat]
      : to
        ? [to.lng, to.lat]
        : [DEFAULT_HOME.lng, DEFAULT_HOME.lat];

    map.current = new mapboxgl.Map({
      container: container.current,
      style: 'mapbox://styles/mapbox/streets-v12',
      center: start,
      zoom: 12.5,
      interactive: true,
    });
    map.current.addControl(
      new mapboxgl.NavigationControl({ showCompass: false }),
      'top-right',
    );
    map.current.on('load', () => {
      map.current?.resize();
      setReady(true);
    });

    return () => {
      pickupMarker.current?.remove();
      dropoffMarker.current?.remove();
      pickupMarker.current = null;
      dropoffMarker.current = null;
      if (map.current) {
        map.current.remove();
        map.current = null;
      }
      setReady(false);
    };
    // Camera is updated when pins change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!ready || !map.current) return undefined;
    let cancelled = false;

    const placeMarker = (ref, place, color, fallbackLabel) => {
      if (!hasLngLat(place)) {
        ref.current?.remove();
        ref.current = null;
        return;
      }
      const lngLat = [place.lng, place.lat];
      const label = place.label || fallbackLabel;
      if (ref.current) {
        ref.current.setLngLat(lngLat);
        ref.current.getPopup()?.setText(label);
      } else {
        ref.current = new mapboxgl.Marker({ color })
          .setLngLat(lngLat)
          .setPopup(new mapboxgl.Popup({ offset: 16 }).setText(label))
          .addTo(map.current);
      }
    };

    placeMarker(pickupMarker, from, '#10b981', 'Pickup');
    placeMarker(dropoffMarker, to, '#0ea5e9', 'Drop-off');

    try {
      const bounds = new mapboxgl.LngLatBounds();
      let n = 0;
      if (from) {
        bounds.extend([from.lng, from.lat]);
        n += 1;
      }
      if (to) {
        bounds.extend([to.lng, to.lat]);
        n += 1;
      }
      if (n === 1) {
        const p = from || to;
        map.current.easeTo({ center: [p.lng, p.lat], zoom: 14, duration: 400 });
      } else if (n >= 2) {
        map.current.fitBounds(bounds, {
          padding: 48,
          maxZoom: 14,
          duration: 500,
        });
      }
    } catch {
      /* ignore */
    }

    (async () => {
      if (!from || !to) return;
      const route = await fetchDrivingRoute(from, to, { steps: false });
      if (cancelled || !map.current || !route?.geometry) return;
      const feature = { type: 'Feature', geometry: route.geometry };
      if (map.current.getSource('trip-route')) {
        map.current.getSource('trip-route').setData(feature);
      } else {
        map.current.addSource('trip-route', { type: 'geojson', data: feature });
        map.current.addLayer({
          id: 'trip-route-line',
          type: 'line',
          source: 'trip-route',
          layout: { 'line-cap': 'round', 'line-join': 'round' },
          paint: {
            'line-color': '#10b981',
            'line-width': 4,
            'line-opacity': 0.85,
          },
        });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [ready, from?.lng, from?.lat, from?.label, to?.lng, to?.lat, to?.label]);

  if (missingToken) {
    return (
      <div
        className={`${className} flex items-center rounded-2xl border border-slate-200 bg-slate-50 px-3 text-sm text-slate-600`}
      >
        Map preview unavailable. Pickup and drop-off addresses are listed above.
      </div>
    );
  }

  if (!from && !to) return null;

  return (
    <div
      className={`relative overflow-hidden rounded-2xl border border-slate-200 bg-slate-100 ${className}`}
    >
      <div ref={container} className="absolute inset-0 h-full w-full" />
      {!ready && (
        <p className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm text-slate-500">
          Loading route…
        </p>
      )}
    </div>
  );
}
