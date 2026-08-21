import { useEffect, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import {
  DEFAULT_HOME,
  hasLngLat,
  mapboxToken,
  reverseGeocode,
} from '../lib/geo';

/**
 * Compact Mapbox map for pinning a place (school / home).
 * Tap the map to drop a pin; parent can also drive this via `place`.
 */
export default function LocationPinMap({
  place,
  onPin,
  className = 'h-52',
  pinColor = '#0ea5e9',
}) {
  const container = useRef(null);
  const map = useRef(null);
  const marker = useRef(null);
  const onPinRef = useRef(onPin);
  const [ready, setReady] = useState(false);
  const [missingToken, setMissingToken] = useState(false);

  onPinRef.current = onPin;

  useEffect(() => {
    const token = mapboxToken();
    if (!token) {
      setMissingToken(true);
      return undefined;
    }
    if (!container.current || map.current) return undefined;

    mapboxgl.accessToken = token;
    const start = hasLngLat(place)
      ? [place.lng, place.lat]
      : [DEFAULT_HOME.lng, DEFAULT_HOME.lat];

    map.current = new mapboxgl.Map({
      container: container.current,
      style: 'mapbox://styles/mapbox/streets-v12',
      center: start,
      zoom: hasLngLat(place) ? 14 : 11.5,
    });
    map.current.addControl(
      new mapboxgl.NavigationControl({ showCompass: false }),
      'top-right',
    );

    map.current.on('load', () => {
      map.current?.resize();
      setReady(true);
    });

    map.current.on('click', async (e) => {
      const { lng, lat } = e.lngLat;
      let label = `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
      try {
        label = await reverseGeocode(lng, lat);
      } catch {
        /* keep coords */
      }
      onPinRef.current?.({ label, lng, lat });
    });

    return () => {
      marker.current?.remove();
      marker.current = null;
      if (map.current) {
        map.current.remove();
        map.current = null;
      }
      setReady(false);
    };
    // place is only used for the initial camera
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!ready || !map.current || !hasLngLat(place)) return;
    const lngLat = [place.lng, place.lat];
    if (marker.current) {
      marker.current.setLngLat(lngLat);
      marker.current.getPopup()?.setText(place.label || 'School');
    } else {
      marker.current = new mapboxgl.Marker({ color: pinColor })
        .setLngLat(lngLat)
        .setPopup(
          new mapboxgl.Popup({ offset: 16 }).setText(place.label || 'School'),
        )
        .addTo(map.current);
    }
    map.current.easeTo({ center: lngLat, zoom: 14, duration: 450 });
  }, [ready, place?.lng, place?.lat, place?.label, pinColor]);

  if (missingToken) {
    return (
      <div
        className={`${className} flex items-center rounded-2xl border border-amber-200 bg-amber-50 px-3 text-sm text-amber-900`}
      >
        Map unavailable. Search and select a school address to save the pin.
      </div>
    );
  }

  return (
    <div
      className={`relative overflow-hidden rounded-2xl border border-slate-200 bg-slate-100 ${className}`}
    >
      <div ref={container} className="absolute inset-0 h-full w-full" />
      {!ready && (
        <p className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm text-slate-500">
          Loading map…
        </p>
      )}
    </div>
  );
}
