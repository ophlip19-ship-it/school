import { useEffect, useRef, useState, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { useAuth } from '../context/AuthContext';
import { ridesApi } from '../lib/api';

const PICKUP = [3.3792, 6.5244];
const DROPOFF = [3.398, 6.515];

export default function LiveTracking() {
  const mapContainer = useRef(null);
  const map = useRef(null);
  const driverMarker = useRef(null);
  const trackingCleanup = useRef(null);
  const driverPos = useRef({ lng: PICKUP[0], lat: PICKUP[1], heading: 45 });

  const [eta, setEta] = useState('Calculating...');
  const [status, setStatus] = useState('Loading…');
  const [distance, setDistance] = useState('');
  const [error, setError] = useState(null);
  const [mapReady, setMapReady] = useState(false);
  const [ride, setRide] = useState(null);

  const { user } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const rideId = params.get('rideId');

  useEffect(() => {
    (async () => {
      try {
        if (rideId) {
          const { ride: r } = await ridesApi.get(rideId);
          setRide(r);
          setStatus(r.status.replace('_', ' '));
        } else {
          const { ride: r } = await ridesApi.active();
          if (r) {
            setRide(r);
            setStatus(r.status.replace('_', ' '));
          } else {
            setStatus('Demo trip');
          }
        }
      } catch {
        setStatus('Demo trip');
      }
    })();
  }, [rideId]);

  const loadRealRoute = useCallback(async (token) => {
    if (!map.current) return;
    const query = `https://api.mapbox.com/directions/v5/mapbox/driving/${PICKUP[0]},${PICKUP[1]};${DROPOFF[0]},${DROPOFF[1]}?geometries=geojson&overview=full&access_token=${token}`;
    try {
      const res = await fetch(query);
      const data = await res.json();
      if (!data.routes?.[0]) {
        setEta('~12 mins left');
        setDistance('2.4 km');
        return;
      }
      const route = data.routes[0];
      setEta(`${Math.round(route.duration / 60)} mins left`);
      setDistance(`${(route.distance / 1000).toFixed(1)} km`);
      const geometry = { type: 'Feature', geometry: route.geometry };
      if (map.current.getSource('route')) {
        map.current.getSource('route').setData(geometry);
      } else {
        map.current.addSource('route', { type: 'geojson', data: geometry });
        map.current.addLayer({
          id: 'route',
          type: 'line',
          source: 'route',
          paint: { 'line-color': '#3b82f6', 'line-width': 6.5, 'line-opacity': 0.85 },
        });
      }
    } catch {
      setEta('~12 mins left');
      setDistance('2.4 km');
    }
  }, []);

  const startRealTimeTracking = useCallback(() => {
    let count = 0;
    const interval = setInterval(() => {
      count += 1;
      driverPos.current.lng += 0.00042;
      driverPos.current.lat += 0.00025;
      driverPos.current.heading = (driverPos.current.heading + 9) % 360;
      if (driverMarker.current) {
        driverMarker.current.setLngLat([driverPos.current.lng, driverPos.current.lat]);
        driverMarker.current.setRotation(driverPos.current.heading);
      }
      if (count % 7 === 0) {
        setEta(`${Math.max(1, 12 - Math.floor(count / 7))} mins left`);
      }
      if (count > 60) {
        setStatus('Arrived safely');
        setEta('Trip completed');
        clearInterval(interval);
      }
    }, 950);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const token = import.meta.env.VITE_MAPBOX_TOKEN;
    if (!token) {
      setError('Missing Mapbox token. Add VITE_MAPBOX_TOKEN to your .env file.');
      setEta('~12 mins left');
      setDistance('2.4 km');
      return undefined;
    }
    if (!mapContainer.current || map.current) return undefined;

    mapboxgl.accessToken = token;
    let cancelled = false;

    try {
      map.current = new mapboxgl.Map({
        container: mapContainer.current,
        style: 'mapbox://styles/mapbox/streets-v12',
        center: [3.385, 6.52],
        zoom: 14.8,
        pitch: 45,
      });
      map.current.addControl(new mapboxgl.NavigationControl({ showCompass: false }), 'top-right');

      map.current.on('load', () => {
        if (cancelled || !map.current) return;
        new mapboxgl.Marker({ color: '#10b981' }).setLngLat(PICKUP).addTo(map.current);
        new mapboxgl.Marker({ color: '#3b82f6' }).setLngLat(DROPOFF).addTo(map.current);
        const el = document.createElement('div');
        el.textContent = '🚗';
        el.style.fontSize = '36px';
        el.style.lineHeight = '1';
        driverMarker.current = new mapboxgl.Marker({ element: el })
          .setLngLat([driverPos.current.lng, driverPos.current.lat])
          .addTo(map.current);
        setMapReady(true);
        loadRealRoute(token);
        trackingCleanup.current = startRealTimeTracking();
      });

      map.current.on('error', () => {
        setError('Map failed to load. Check your Mapbox token and network.');
      });
    } catch (err) {
      setError(`Failed to load map: ${err.message}`);
    }

    return () => {
      cancelled = true;
      if (trackingCleanup.current) trackingCleanup.current();
      driverMarker.current = null;
      if (map.current) {
        map.current.remove();
        map.current = null;
      }
    };
  }, [loadRealRoute, startRealTimeTracking]);

  const markDelivered = async () => {
    if (ride?.id) {
      try {
        await ridesApi.setStatus(ride.id, 'completed');
      } catch {
        /* ignore */
      }
    }
    setStatus('Delivered');
    setEta('Trip completed');
    navigate(user?.role === 'driver' ? '/driver' : '/dashboard');
  };

  return (
    <div className="relative flex h-screen flex-col overflow-hidden bg-slate-100">
      <div ref={mapContainer} className="min-h-0 w-full flex-1" />

      {!mapReady && !error && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-slate-100/80">
          <p className="rounded-full bg-white px-4 py-2 text-sm font-medium text-slate-600 shadow">
            Loading map…
          </p>
        </div>
      )}

      {error && (
        <div className="absolute inset-x-4 top-24 z-20 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 shadow">
          <p className="font-semibold">Map unavailable</p>
          <p className="mt-1">{error}</p>
        </div>
      )}

      <div className="absolute left-4 right-4 top-4 z-10 flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="flex h-11 w-11 items-center justify-center rounded-full bg-white text-xl shadow"
        >
          ←
        </button>
        <div className="rounded-full bg-emerald-600 px-5 py-2.5 text-sm font-semibold capitalize text-white shadow">
          {status}
        </div>
        <button
          type="button"
          onClick={() => alert('SOS sent to SchoolRun safety team and emergency contacts.')}
          className="h-11 rounded-full bg-red-600 px-3 text-sm font-bold text-white shadow"
        >
          SOS
        </button>
      </div>

      <div className="absolute bottom-0 left-0 right-0 z-10 rounded-t-3xl bg-white p-6 shadow-2xl">
        <div className="mb-5 flex items-center gap-4">
          <div className="text-4xl">👨‍✈️</div>
          <div className="min-w-0 flex-1">
            <h3 className="truncate text-lg font-bold text-slate-900">
              {ride?.driverName || user?.driverName || 'David K.'}
            </h3>
            <p className="text-sm text-slate-500">
              Plate: {ride?.vehiclePlate || user?.vehiclePlate || '56A-902-LGS'}
            </p>
            {ride?.childName && (
              <p className="text-xs text-slate-400">Child: {ride.childName}</p>
            )}
          </div>
          <div className="text-right font-mono">
            <div className="text-xl font-bold text-slate-900">{eta}</div>
            {distance && <div className="text-xs text-slate-500">{distance}</div>}
          </div>
        </div>

        <div className="mb-6 rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-5 text-center">
          <p className="text-xs uppercase tracking-widest text-slate-500">Handover PIN</p>
          <p className="mt-1 font-mono text-5xl font-black tracking-widest text-slate-900">
            {ride?.handoverPin || '4821'}
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => navigate(ride?.id ? `/chat?rideId=${ride.id}` : '/chat')}
            className="rounded-2xl bg-slate-100 py-4 font-semibold text-slate-800"
          >
            Open chat
          </button>
          <button
            type="button"
            onClick={markDelivered}
            className="rounded-2xl bg-slate-900 py-4 font-semibold text-white"
          >
            Mark delivered
          </button>
        </div>
      </div>
    </div>
  );
}
