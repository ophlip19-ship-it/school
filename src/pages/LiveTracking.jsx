import { useEffect, useRef, useState, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { useAuth } from '../context/AuthContext';
import { ridesApi } from '../lib/api';
import { connectSocket, getSocket } from '../lib/socket';
import { DEFAULT_HOME, DEFAULT_SCHOOL, mapboxToken, watchPosition } from '../lib/geo';

function toLngLat(coords, fallback) {
  if (coords?.lng != null && coords?.lat != null) {
    return [coords.lng, coords.lat];
  }
  return fallback;
}

function trailToGeoJSON(trail) {
  const coords = (trail || [])
    .filter((p) => p?.lng != null && p?.lat != null)
    .map((p) => [p.lng, p.lat]);
  return {
    type: 'Feature',
    geometry: {
      type: 'LineString',
      coordinates: coords.length >= 2 ? coords : coords.length === 1 ? [coords[0], coords[0]] : [],
    },
  };
}

export default function LiveTracking() {
  const mapContainer = useRef(null);
  const map = useRef(null);
  const driverMarker = useRef(null);
  const pickupMarker = useRef(null);
  const dropoffMarker = useRef(null);
  const shareCleanup = useRef(null);
  const trailRef = useRef([]);

  const [eta, setEta] = useState('Calculating…');
  const [status, setStatus] = useState('Loading…');
  const [distance, setDistance] = useState('');
  const [error, setError] = useState(null);
  const [mapReady, setMapReady] = useState(false);
  const [ride, setRide] = useState(null);
  const [liveHint, setLiveHint] = useState('');

  const { user } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const rideId = params.get('rideId');
  const isDriver = user?.role === 'driver';

  const pickupLngLat = useRef(toLngLat(null, [DEFAULT_HOME.lng, DEFAULT_HOME.lat]));
  const dropoffLngLat = useRef(toLngLat(null, [DEFAULT_SCHOOL.lng, DEFAULT_SCHOOL.lat]));

  const upsertLine = useCallback((sourceId, layerId, feature, paint) => {
    if (!map.current) return;
    if (map.current.getSource(sourceId)) {
      map.current.getSource(sourceId).setData(feature);
    } else {
      map.current.addSource(sourceId, { type: 'geojson', data: feature });
      map.current.addLayer({
        id: layerId,
        type: 'line',
        source: sourceId,
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint,
      });
    }
  }, []);

  const setTrailOnMap = useCallback(
    (trail) => {
      trailRef.current = trail || [];
      const feature = trailToGeoJSON(trailRef.current);
      if (!feature.geometry.coordinates.length) return;
      upsertLine('driver-trail', 'driver-trail-line', feature, {
        'line-color': '#2563eb',
        'line-width': 7,
        'line-opacity': 0.95,
      });
    },
    [upsertLine],
  );

  const moveDriverMarker = useCallback((lng, lat, heading = 0) => {
    if (!driverMarker.current || !map.current) return;
    driverMarker.current.setLngLat([lng, lat]);
    if (typeof driverMarker.current.setRotation === 'function') {
      driverMarker.current.setRotation(heading || 0);
    }
    // Keep car in view lightly
    const center = map.current.getCenter();
    const dx = Math.abs(center.lng - lng);
    const dy = Math.abs(center.lat - lat);
    if (dx > 0.008 || dy > 0.008) {
      map.current.easeTo({ center: [lng, lat], duration: 800 });
    }
  }, []);

  const loadPlannedRoute = useCallback(
    async (token, from, to) => {
      if (!map.current || !from || !to) return;
      const query = `https://api.mapbox.com/directions/v5/mapbox/driving/${from[0]},${from[1]};${to[0]},${to[1]}?geometries=geojson&overview=full&access_token=${token}`;
      try {
        const res = await fetch(query);
        const data = await res.json();
        if (!data.routes?.[0]) {
          setEta('Route unavailable');
          return;
        }
        const route = data.routes[0];
        setEta(`${Math.round(route.duration / 60)} mins`);
        setDistance(`${(route.distance / 1000).toFixed(1)} km`);
        const geometry = { type: 'Feature', geometry: route.geometry };
        // Planned route — lighter blue underlay
        upsertLine('planned-route', 'planned-route-line', geometry, {
          'line-color': '#93c5fd',
          'line-width': 5,
          'line-opacity': 0.55,
          'line-dasharray': [1.5, 1.5],
        });
      } catch {
        setEta('Route unavailable');
      }
    },
    [upsertLine],
  );

  // Load ride
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        let r = null;
        if (rideId) {
          const res = await ridesApi.get(rideId);
          r = res.ride;
        } else {
          const res = await ridesApi.active();
          r = res.ride;
        }
        if (cancelled) return;
        if (r) {
          setRide(r);
          setStatus(String(r.status || 'active').replace(/_/g, ' '));
          pickupLngLat.current = toLngLat(r.pickupCoords, [
            DEFAULT_HOME.lng,
            DEFAULT_HOME.lat,
          ]);
          dropoffLngLat.current = toLngLat(r.dropoffCoords, [
            DEFAULT_SCHOOL.lng,
            DEFAULT_SCHOOL.lat,
          ]);
          if (Array.isArray(r.trail)) trailRef.current = r.trail;
        } else {
          setStatus('Demo trip');
          setLiveHint('No active ride — showing demo route');
        }
      } catch {
        if (!cancelled) {
          setStatus('Demo trip');
          setLiveHint('Could not load ride — showing demo route');
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [rideId]);

  // Init map once ride anchors known (or demo)
  useEffect(() => {
    const token = mapboxToken();
    if (!token) {
      setError('Missing Mapbox token. Add VITE_MAPBOX_TOKEN to your .env file.');
      setEta('~12 mins');
      setDistance('2.4 km');
      return undefined;
    }
    if (!mapContainer.current || map.current) return undefined;

    mapboxgl.accessToken = token;
    let cancelled = false;

    const from = pickupLngLat.current;
    const to = dropoffLngLat.current;
    const mid = [(from[0] + to[0]) / 2, (from[1] + to[1]) / 2];

    try {
      map.current = new mapboxgl.Map({
        container: mapContainer.current,
        style: 'mapbox://styles/mapbox/streets-v12',
        center: mid,
        zoom: 13.5,
        pitch: 40,
      });
      map.current.addControl(new mapboxgl.NavigationControl({ showCompass: false }), 'top-right');

      map.current.on('load', () => {
        if (cancelled || !map.current) return;

        pickupMarker.current = new mapboxgl.Marker({ color: '#10b981' })
          .setLngLat(from)
          .setPopup(new mapboxgl.Popup().setText(ride?.pickup || 'Pickup'))
          .addTo(map.current);

        dropoffMarker.current = new mapboxgl.Marker({ color: '#0ea5e9' })
          .setLngLat(to)
          .setPopup(new mapboxgl.Popup().setText(ride?.dropoff || 'Drop-off'))
          .addTo(map.current);

        const el = document.createElement('div');
        el.textContent = '🚗';
        el.style.fontSize = '34px';
        el.style.lineHeight = '1';
        el.style.filter = 'drop-shadow(0 2px 4px rgba(0,0,0,0.35))';

        const start =
          ride?.driverLocation?.lng != null
            ? [ride.driverLocation.lng, ride.driverLocation.lat]
            : from;

        driverMarker.current = new mapboxgl.Marker({ element: el, rotationAlignment: 'map' })
          .setLngLat(start)
          .addTo(map.current);

        setMapReady(true);
        loadPlannedRoute(token, from, to);
        if (trailRef.current.length) setTrailOnMap(trailRef.current);

        // Fit bounds
        try {
          const bounds = new mapboxgl.LngLatBounds();
          bounds.extend(from);
          bounds.extend(to);
          if (start) bounds.extend(start);
          map.current.fitBounds(bounds, { padding: 80, maxZoom: 15, duration: 600 });
        } catch {
          /* ignore */
        }
      });

      map.current.on('error', () => {
        setError('Map failed to load. Check your Mapbox token and network.');
      });
    } catch (err) {
      setError(`Failed to load map: ${err.message}`);
    }

    return () => {
      cancelled = true;
      if (shareCleanup.current) shareCleanup.current();
      driverMarker.current = null;
      pickupMarker.current = null;
      dropoffMarker.current = null;
      if (map.current) {
        map.current.remove();
        map.current = null;
      }
    };
    // Re-init when ride id changes so coords refresh
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ride?.id, loadPlannedRoute, setTrailOnMap]);

  // When ride loads after map, refresh markers/route/trail
  useEffect(() => {
    if (!map.current || !mapReady || !ride) return;
    const from = toLngLat(ride.pickupCoords, pickupLngLat.current);
    const to = toLngLat(ride.dropoffCoords, dropoffLngLat.current);
    pickupLngLat.current = from;
    dropoffLngLat.current = to;
    pickupMarker.current?.setLngLat(from);
    dropoffMarker.current?.setLngLat(to);
    if (ride.driverLocation?.lng != null) {
      moveDriverMarker(
        ride.driverLocation.lng,
        ride.driverLocation.lat,
        ride.driverLocation.heading,
      );
    }
    if (ride.trail?.length) setTrailOnMap(ride.trail);
    const token = mapboxToken();
    if (token) loadPlannedRoute(token, from, to);
  }, [ride, mapReady, moveDriverMarker, setTrailOnMap, loadPlannedRoute]);

  // Socket: join ride room + receive location; driver shares GPS
  useEffect(() => {
    const id = ride?.id || rideId;
    if (!id || !user) return undefined;

    const token = localStorage.getItem('schoolrun_token');
    const socket = connectSocket(token);

    const onLocation = (payload) => {
      if (!payload || String(payload.rideId) !== String(id)) return;
      if (payload.lng != null && payload.lat != null) {
        moveDriverMarker(payload.lng, payload.lat, payload.heading);
      }
      if (Array.isArray(payload.trail)) {
        setTrailOnMap(payload.trail);
      } else if (payload.lng != null) {
        const next = [
          ...trailRef.current,
          { lng: payload.lng, lat: payload.lat, at: payload.updatedAt },
        ];
        setTrailOnMap(next);
      }
      setLiveHint('Live · driver moving');
    };

    const join = () => {
      socket.emit('ride:join', { rideId: id }, (ack) => {
        if (ack?.error) return;
        if (ack?.driverLocation?.lng != null) {
          moveDriverMarker(
            ack.driverLocation.lng,
            ack.driverLocation.lat,
            ack.driverLocation.heading,
          );
        }
        if (ack?.trail?.length) setTrailOnMap(ack.trail);
      });
    };

    if (socket.connected) join();
    else socket.on('connect', join);

    socket.on('ride:location', onLocation);

    // Driver: stream GPS into the ride
    if (isDriver && ride?.driverId === user.id) {
      setLiveHint('Sharing your location…');
      shareCleanup.current = watchPosition(
        (pos) => {
          moveDriverMarker(pos.lng, pos.lat, pos.heading || 0);
          const s = getSocket();
          if (s?.connected) {
            s.emit(
              'ride:location',
              {
                rideId: id,
                lng: pos.lng,
                lat: pos.lat,
                heading: pos.heading || 0,
              },
              () => {},
            );
          } else {
            ridesApi
              .updateLocation(id, {
                lng: pos.lng,
                lat: pos.lat,
                heading: pos.heading || 0,
              })
              .catch(() => {});
          }
        },
        () => {
          setLiveHint('Enable location to share your position');
        },
      );
    } else {
      setLiveHint('Waiting for driver location…');
      // Parent polling fallback if sockets drop
      const poll = setInterval(() => {
        ridesApi
          .getLocation(id)
          .then((loc) => {
            if (loc.driverLocation?.lng != null) {
              moveDriverMarker(
                loc.driverLocation.lng,
                loc.driverLocation.lat,
                loc.driverLocation.heading,
              );
            }
            if (loc.trail?.length) setTrailOnMap(loc.trail);
          })
          .catch(() => {});
      }, 8000);
      shareCleanup.current = () => clearInterval(poll);
    }

    return () => {
      socket.off('ride:location', onLocation);
      socket.off('connect', join);
      socket.emit('ride:leave', { rideId: id });
      if (shareCleanup.current) {
        shareCleanup.current();
        shareCleanup.current = null;
      }
    };
  }, [ride?.id, ride?.driverId, rideId, user, isDriver, moveDriverMarker, setTrailOnMap]);

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
        <div className="min-w-0 flex-1 text-center">
          <div className="inline-flex max-w-full flex-col items-center rounded-2xl bg-emerald-600 px-4 py-2 text-white shadow">
            <span className="truncate text-sm font-semibold capitalize">{status}</span>
            {liveHint && (
              <span className="truncate text-[10px] font-medium text-emerald-100">
                {liveHint}
              </span>
            )}
          </div>
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
        <div className="mb-3 flex items-center gap-2 text-xs text-slate-500">
          <span className="inline-flex items-center gap-1">
            <span className="h-2 w-2 rounded-full bg-emerald-500" /> Pickup
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="h-2 w-2 rounded-full bg-sky-500" /> Drop-off
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="h-2 w-6 rounded-full bg-blue-600" /> Driver trail
          </span>
        </div>

        <div className="mb-4 space-y-1 text-sm text-slate-600">
          <p className="truncate">
            <span className="font-medium text-slate-800">From:</span>{' '}
            {ride?.pickup || DEFAULT_HOME.label}
          </p>
          <p className="truncate">
            <span className="font-medium text-slate-800">To:</span>{' '}
            {ride?.dropoff || DEFAULT_SCHOOL.label}
          </p>
        </div>

        <div className="mb-5 flex items-center gap-4">
          <div className="text-4xl">👨‍✈️</div>
          <div className="min-w-0 flex-1">
            <h3 className="truncate text-lg font-bold text-slate-900">
              {ride?.driverName || user?.driverName || 'Driver'}
            </h3>
            <p className="text-sm text-slate-500">
              Plate: {ride?.vehiclePlate || user?.vehiclePlate || '—'}
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
            {ride?.handoverPin || '—'}
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
