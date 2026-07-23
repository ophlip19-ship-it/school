import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { MapPin, Radio, RefreshCw, Users } from 'lucide-react';
import { adminApi } from '../lib/api';
import { connectSocket } from '../lib/socket';
import { DEFAULT_HOME, DEFAULT_SCHOOL, mapboxToken } from '../lib/geo';

const DRIVER_COLORS = [
  '#2563eb',
  '#7c3aed',
  '#db2777',
  '#ea580c',
  '#0891b2',
  '#059669',
  '#ca8a04',
  '#4f46e5',
];

function colorForRide(rideId, index) {
  if (rideId == null) return DRIVER_COLORS[index % DRIVER_COLORS.length];
  let hash = 0;
  const s = String(rideId);
  for (let i = 0; i < s.length; i += 1) {
    hash = (hash * 31 + s.charCodeAt(i)) >>> 0;
  }
  return DRIVER_COLORS[hash % DRIVER_COLORS.length];
}

function trailToFeature(trail) {
  const coords = (trail || [])
    .filter((p) => p?.lng != null && p?.lat != null)
    .map((p) => [p.lng, p.lat]);
  return {
    type: 'Feature',
    geometry: {
      type: 'LineString',
      coordinates:
        coords.length >= 2
          ? coords
          : coords.length === 1
            ? [coords[0], coords[0]]
            : [],
    },
  };
}

function formatFeedTime(at) {
  if (!at) return '';
  try {
    return new Date(at).toLocaleTimeString(undefined, {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  } catch {
    return '';
  }
}

export default function AdminTransitMap() {
  const mapContainer = useRef(null);
  const map = useRef(null);
  const markersRef = useRef(new Map()); // rideId -> { driver, pickup, dropoff }
  const routeCache = useRef(new Map()); // rideId -> last route fetch time
  const ridesRef = useRef({});

  const [rides, setRides] = useState({});
  const [mapReady, setMapReady] = useState(false);
  const [error, setError] = useState('');
  const [feed, setFeed] = useState([]);
  const [connected, setConnected] = useState(false);
  const [selectedId, setSelectedId] = useState(null);

  const rideList = Object.values(rides);

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

  const removeRideLayers = useCallback((rideId) => {
    if (!map.current) return;
    const ids = [
      [`trail-${rideId}`, `trail-line-${rideId}`],
      [`route-${rideId}`, `route-line-${rideId}`],
    ];
    for (const [sourceId, layerId] of ids) {
      try {
        if (map.current.getLayer(layerId)) map.current.removeLayer(layerId);
        if (map.current.getSource(sourceId)) map.current.removeSource(sourceId);
      } catch {
        /* ignore */
      }
    }
    const markers = markersRef.current.get(rideId);
    if (markers) {
      markers.driver?.remove();
      markers.pickup?.remove();
      markers.dropoff?.remove();
      markersRef.current.delete(rideId);
    }
  }, []);

  const loadRoute = useCallback(
    async (rideId, from, to, color) => {
      const token = mapboxToken();
      if (!token || !from || !to || !map.current) return;
      const now = Date.now();
      const last = routeCache.current.get(rideId) || 0;
      if (now - last < 15000) return;
      routeCache.current.set(rideId, now);

      try {
        const query = `https://api.mapbox.com/directions/v5/mapbox/driving/${from[0]},${from[1]};${to[0]},${to[1]}?geometries=geojson&overview=full&access_token=${token}`;
        const res = await fetch(query);
        const data = await res.json();
        if (!data.routes?.[0]) return;
        upsertLine(
          `route-${rideId}`,
          `route-line-${rideId}`,
          { type: 'Feature', geometry: data.routes[0].geometry },
          {
            'line-color': color,
            'line-width': 4,
            'line-opacity': 0.45,
            'line-dasharray': [1.2, 1.2],
          },
        );
      } catch {
        /* ignore */
      }
    },
    [upsertLine],
  );

  const ensureMarkers = useCallback((ride, color) => {
    if (!map.current) return;
    let bundle = markersRef.current.get(ride.id);
    if (!bundle) {
      const el = document.createElement('div');
      el.style.width = '36px';
      el.style.height = '36px';
      el.style.borderRadius = '9999px';
      el.style.background = color;
      el.style.border = '3px solid white';
      el.style.boxShadow = '0 2px 8px rgba(0,0,0,0.35)';
      el.style.display = 'flex';
      el.style.alignItems = 'center';
      el.style.justifyContent = 'center';
      el.style.fontSize = '16px';
      el.textContent = '🚗';
      el.title = ride.driverName || 'Driver';

      const driver = new mapboxgl.Marker({ element: el })
        .setLngLat([
          ride.driverLocation?.lng ?? ride.pickupCoords?.lng ?? DEFAULT_HOME.lng,
          ride.driverLocation?.lat ?? ride.pickupCoords?.lat ?? DEFAULT_HOME.lat,
        ])
        .setPopup(
          new mapboxgl.Popup({ offset: 16 }).setHTML(
            `<strong>${ride.driverName || 'Driver'}</strong><br/>${ride.childName || ''}<br/>${ride.vehiclePlate || ''}`,
          ),
        )
        .addTo(map.current);

      let pickup = null;
      let dropoff = null;
      if (ride.pickupCoords?.lng != null) {
        pickup = new mapboxgl.Marker({ color: '#10b981', scale: 0.75 })
          .setLngLat([ride.pickupCoords.lng, ride.pickupCoords.lat])
          .setPopup(new mapboxgl.Popup().setText(`Pickup: ${ride.pickup || ''}`))
          .addTo(map.current);
      }
      if (ride.dropoffCoords?.lng != null) {
        dropoff = new mapboxgl.Marker({ color: '#0ea5e9', scale: 0.75 })
          .setLngLat([ride.dropoffCoords.lng, ride.dropoffCoords.lat])
          .setPopup(new mapboxgl.Popup().setText(`Drop-off: ${ride.dropoff || ''}`))
          .addTo(map.current);
      }

      bundle = { driver, pickup, dropoff };
      markersRef.current.set(ride.id, bundle);
    }
    return bundle;
  }, []);

  const paintRide = useCallback(
    (ride, index = 0) => {
      if (!map.current || !ride?.id) return;
      const color = colorForRide(ride.id, index);
      const bundle = ensureMarkers(ride, color);

      if (ride.driverLocation?.lng != null) {
        bundle.driver.setLngLat([
          ride.driverLocation.lng,
          ride.driverLocation.lat,
        ]);
      }

      if (ride.trail?.length) {
        const feature = trailToFeature(ride.trail);
        if (feature.geometry.coordinates.length) {
          upsertLine(`trail-${ride.id}`, `trail-line-${ride.id}`, feature, {
            'line-color': color,
            'line-width': 5,
            'line-opacity': 0.9,
          });
        }
      }

      const from =
        ride.driverLocation?.lng != null
          ? [ride.driverLocation.lng, ride.driverLocation.lat]
          : ride.pickupCoords?.lng != null
            ? [ride.pickupCoords.lng, ride.pickupCoords.lat]
            : null;
      const to =
        ride.dropoffCoords?.lng != null
          ? [ride.dropoffCoords.lng, ride.dropoffCoords.lat]
          : null;
      if (from && to) {
        // Planned remaining route driver → dropoff
        loadRoute(ride.id, from, to, color);
        // Also show full pickup→dropoff once
        if (ride.pickupCoords?.lng != null) {
          loadRoute(
            `${ride.id}-full`,
            [ride.pickupCoords.lng, ride.pickupCoords.lat],
            to,
            color,
          );
        }
      }
    },
    [ensureMarkers, upsertLine, loadRoute],
  );

  const fitAll = useCallback(() => {
    if (!map.current) return;
    const list = Object.values(ridesRef.current);
    if (!list.length) {
      map.current.easeTo({
        center: [DEFAULT_HOME.lng, DEFAULT_HOME.lat],
        zoom: 11,
        duration: 400,
      });
      return;
    }
    try {
      const bounds = new mapboxgl.LngLatBounds();
      let has = false;
      for (const r of list) {
        if (r.driverLocation?.lng != null) {
          bounds.extend([r.driverLocation.lng, r.driverLocation.lat]);
          has = true;
        }
        if (r.pickupCoords?.lng != null) {
          bounds.extend([r.pickupCoords.lng, r.pickupCoords.lat]);
          has = true;
        }
        if (r.dropoffCoords?.lng != null) {
          bounds.extend([r.dropoffCoords.lng, r.dropoffCoords.lat]);
          has = true;
        }
      }
      if (has) {
        map.current.fitBounds(bounds, { padding: 70, maxZoom: 14, duration: 600 });
      }
    } catch {
      /* ignore */
    }
  }, []);

  const mergeRides = useCallback(
    (list) => {
      const next = {};
      const feedItems = [];
      list.forEach((r, i) => {
        if (!r?.id) return;
        next[r.id] = r;
        (r.transitFeed || []).forEach((e) => {
          feedItems.push({
            ...e,
            rideId: r.id,
            driverName: r.driverName,
            childName: r.childName,
          });
        });
        paintRide(r, i);
      });

      // Remove rides no longer in transit
      Object.keys(ridesRef.current).forEach((id) => {
        if (!next[id]) removeRideLayers(id);
      });

      ridesRef.current = next;
      setRides(next);
      feedItems.sort((a, b) => new Date(b.at) - new Date(a.at));
      setFeed(feedItems.slice(0, 40));
    },
    [paintRide, removeRideLayers],
  );

  // Init map
  useEffect(() => {
    const token = mapboxToken();
    if (!token) {
      setError('Missing Mapbox token. Add VITE_MAPBOX_TOKEN to your .env file.');
      return undefined;
    }
    if (!mapContainer.current || map.current) return undefined;

    mapboxgl.accessToken = token;
    map.current = new mapboxgl.Map({
      container: mapContainer.current,
      style: 'mapbox://styles/mapbox/streets-v12',
      center: [DEFAULT_HOME.lng, DEFAULT_HOME.lat],
      zoom: 11.5,
      pitch: 30,
    });
    map.current.addControl(new mapboxgl.NavigationControl({ showCompass: false }), 'top-right');
    map.current.on('load', () => setMapReady(true));
    map.current.on('error', () =>
      setError('Map failed to load. Check Mapbox token and network.'),
    );

    return () => {
      markersRef.current.forEach((m) => {
        m.driver?.remove();
        m.pickup?.remove();
        m.dropoff?.remove();
      });
      markersRef.current.clear();
      if (map.current) {
        map.current.remove();
        map.current = null;
      }
    };
  }, []);

  // Initial REST load + socket
  useEffect(() => {
    if (!mapReady) return undefined;

    let cancelled = false;

    adminApi
      .transit()
      .then((data) => {
        if (cancelled) return;
        mergeRides(data.rides || []);
        setTimeout(fitAll, 300);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message);
      });

    const token = localStorage.getItem('schoolrun_token');
    const socket = connectSocket(token);

    const onLocation = (payload) => {
      if (!payload?.rideId) return;
      const id = String(payload.rideId);
      setRides((prev) => {
        const existing = prev[id] || {
          id,
          childName: payload.childName,
          driverId: payload.driverId,
          pickup: payload.pickup,
          dropoff: payload.dropoff,
          pickupCoords: payload.pickupCoords,
          dropoffCoords: payload.dropoffCoords,
          status: 'in_transit',
          locationSharing: true,
        };
        const updated = {
          ...existing,
          driverLocation: {
            lng: payload.lng,
            lat: payload.lat,
            heading: payload.heading || 0,
            updatedAt: payload.updatedAt,
          },
          trail: payload.trail || existing.trail || [],
          transitFeed: payload.transitFeed || existing.transitFeed || [],
          locationSharing: true,
          status: payload.status || 'in_transit',
          pickupCoords: payload.pickupCoords || existing.pickupCoords,
          dropoffCoords: payload.dropoffCoords || existing.dropoffCoords,
          pickup: payload.pickup || existing.pickup,
          dropoff: payload.dropoff || existing.dropoff,
          childName: payload.childName || existing.childName,
        };
        ridesRef.current = { ...ridesRef.current, [id]: updated };
        paintRide(updated);
        return { ...prev, [id]: updated };
      });

      if (Array.isArray(payload.transitFeed) && payload.transitFeed.length) {
        const last = payload.transitFeed[payload.transitFeed.length - 1];
        setFeed((prev) => {
          const entry = {
            ...last,
            rideId: id,
            driverName: ridesRef.current[id]?.driverName,
            childName: payload.childName || ridesRef.current[id]?.childName,
          };
          const next = [entry, ...prev.filter((e) => e.at !== last.at || e.rideId !== id)];
          return next.slice(0, 40);
        });
      }
    };

    const onStarted = (ride) => {
      if (!ride?.id) return;
      setRides((prev) => {
        const next = { ...prev, [ride.id]: ride };
        ridesRef.current = next;
        paintRide(ride);
        return next;
      });
      const last = (ride.transitFeed || []).slice(-1)[0];
      if (last) {
        setFeed((prev) =>
          [
            {
              ...last,
              rideId: ride.id,
              driverName: ride.driverName,
              childName: ride.childName,
            },
            ...prev,
          ].slice(0, 40),
        );
      }
    };

    const onEnded = (payload) => {
      if (!payload?.rideId) return;
      const id = String(payload.rideId);
      removeRideLayers(id);
      setRides((prev) => {
        const next = { ...prev };
        delete next[id];
        ridesRef.current = next;
        return next;
      });
      if (Array.isArray(payload.transitFeed) && payload.transitFeed.length) {
        const last = payload.transitFeed[payload.transitFeed.length - 1];
        setFeed((prev) =>
          [
            {
              ...last,
              rideId: id,
              childName: ridesRef.current[id]?.childName,
            },
            ...prev,
          ].slice(0, 40),
        );
      } else {
        setFeed((prev) =>
          [
            {
              type: 'delivered',
              message: 'Trip left transit · location sharing stopped',
              at: new Date().toISOString(),
              rideId: id,
            },
            ...prev,
          ].slice(0, 40),
        );
      }
      if (selectedId === id) setSelectedId(null);
    };

    const join = () => {
      socket.emit('admin:transit:join', {}, (ack) => {
        if (ack?.error) {
          setError(ack.error);
          setConnected(false);
          return;
        }
        setConnected(true);
        if (Array.isArray(ack.rides)) {
          mergeRides(ack.rides);
          setTimeout(fitAll, 300);
        }
      });
    };

    if (socket.connected) join();
    else socket.on('connect', join);

    socket.on('transit:location', onLocation);
    socket.on('transit:started', onStarted);
    socket.on('transit:ended', onEnded);
    socket.on('disconnect', () => setConnected(false));

    return () => {
      cancelled = true;
      socket.off('connect', join);
      socket.off('transit:location', onLocation);
      socket.off('transit:started', onStarted);
      socket.off('transit:ended', onEnded);
      socket.emit('admin:transit:leave');
    };
  }, [mapReady, mergeRides, paintRide, removeRideLayers, fitAll, selectedId]);

  const refresh = async () => {
    try {
      const data = await adminApi.transit();
      mergeRides(data.rides || []);
      fitAll();
    } catch (err) {
      setError(err.message);
    }
  };

  const focusRide = (id) => {
    setSelectedId(id);
    const r = rides[id];
    if (!r || !map.current) return;
    try {
      const bounds = new mapboxgl.LngLatBounds();
      if (r.driverLocation?.lng != null) {
        bounds.extend([r.driverLocation.lng, r.driverLocation.lat]);
      }
      if (r.pickupCoords?.lng != null) {
        bounds.extend([r.pickupCoords.lng, r.pickupCoords.lat]);
      }
      if (r.dropoffCoords?.lng != null) {
        bounds.extend([r.dropoffCoords.lng, r.dropoffCoords.lat]);
      }
      map.current.fitBounds(bounds, { padding: 90, maxZoom: 14, duration: 500 });
    } catch {
      /* ignore */
    }
  };

  return (
    <div className="relative flex h-screen flex-col overflow-hidden bg-slate-100">
      <div ref={mapContainer} className="min-h-0 w-full flex-1" />

      {/* Top bar */}
      <div className="absolute left-4 right-4 top-4 z-10 flex flex-wrap items-center gap-2">
        <Link
          to="/admin"
          className="flex h-11 items-center rounded-full bg-white px-4 text-sm font-semibold text-slate-800 shadow"
        >
          ← Admin
        </Link>
        <div className="flex items-center gap-2 rounded-2xl bg-slate-900 px-4 py-2 text-white shadow">
          <Radio size={16} className={connected ? 'text-emerald-400' : 'text-amber-400'} />
          <span className="text-sm font-semibold">
            Transit map · {rideList.length} live
          </span>
          <span className="text-[10px] text-slate-300">
            {connected ? 'Realtime' : 'Reconnecting…'}
          </span>
        </div>
        <button
          type="button"
          onClick={refresh}
          className="flex h-11 items-center gap-1 rounded-full bg-white px-3 text-sm font-medium text-slate-700 shadow"
        >
          <RefreshCw size={16} /> Refresh
        </button>
        <button
          type="button"
          onClick={fitAll}
          className="flex h-11 items-center gap-1 rounded-full bg-white px-3 text-sm font-medium text-slate-700 shadow"
        >
          <MapPin size={16} /> Fit all
        </button>
      </div>

      {error && (
        <div className="absolute inset-x-4 top-20 z-20 rounded-2xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 shadow">
          {error}
        </div>
      )}

      {/* Side panel */}
      <div className="absolute bottom-0 left-0 right-0 z-10 flex max-h-[48vh] flex-col gap-0 overflow-hidden rounded-t-3xl bg-white shadow-2xl md:bottom-4 md:left-4 md:right-auto md:top-20 md:max-h-none md:w-96 md:rounded-3xl">
        <div className="border-b border-slate-100 p-4">
          <h1 className="flex items-center gap-2 text-lg font-bold text-slate-900">
            <Users size={18} /> Drivers in transit
          </h1>
          <p className="mt-1 text-xs text-slate-500">
            Live routing & feed after pickup confirmation. Sharing stops at drop-off.
          </p>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          {rideList.length === 0 ? (
            <p className="p-3 text-sm text-slate-500">
              No drivers currently sharing location. Drivers appear here after they confirm
              pickup.
            </p>
          ) : (
            <ul className="space-y-2">
              {rideList.map((r, i) => {
                const color = colorForRide(r.id, i);
                return (
                  <li key={r.id}>
                    <button
                      type="button"
                      onClick={() => focusRide(r.id)}
                      className={`w-full rounded-2xl border p-3 text-left transition ${
                        selectedId === r.id
                          ? 'border-slate-900 bg-slate-50'
                          : 'border-slate-200 bg-white hover:bg-slate-50'
                      }`}
                    >
                      <div className="flex items-start gap-2">
                        <span
                          className="mt-1 h-3 w-3 shrink-0 rounded-full"
                          style={{ background: color }}
                        />
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-semibold text-slate-900">
                            {r.driverName || 'Driver'}
                            {r.vehiclePlate ? ` · ${r.vehiclePlate}` : ''}
                          </p>
                          <p className="truncate text-xs text-slate-500">
                            {r.childName} · {r.pickup} → {r.dropoff}
                          </p>
                          <p className="mt-1 text-[10px] font-medium uppercase tracking-wide text-emerald-600">
                            Live sharing
                          </p>
                        </div>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

          <div className="mt-4">
            <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-slate-500">
              Live feed
            </p>
            {feed.length === 0 ? (
              <p className="text-sm text-slate-500">No transit events yet.</p>
            ) : (
              <ul className="max-h-48 space-y-2 overflow-y-auto">
                {feed.map((item, i) => (
                  <li
                    key={`${item.rideId}-${item.at}-${i}`}
                    className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2 text-sm"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-xs font-semibold text-slate-700">
                        {item.driverName || item.childName || 'Trip'}
                      </span>
                      <span className="shrink-0 font-mono text-[10px] text-slate-400">
                        {formatFeedTime(item.at)}
                      </span>
                    </div>
                    <p
                      className={
                        item.type === 'delivered'
                          ? 'mt-0.5 text-emerald-700'
                          : item.type === 'pickup_confirmed'
                            ? 'mt-0.5 text-indigo-700'
                            : 'mt-0.5 text-slate-600'
                      }
                    >
                      {item.message}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
