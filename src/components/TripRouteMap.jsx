import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import {
  DEFAULT_HOME,
  fetchDrivingRoute,
  hasLngLat,
  mapboxToken,
} from '../lib/geo';
import { connectSocket } from '../lib/socket';
import { ridesApi } from '../lib/api';
import {
  canSeeLiveLocation,
  childForRide,
  colorForKey,
  rideForChild,
  tripPosition,
  tripStatusLabel,
} from '../lib/childTrips';
import { createChildPinEl } from '../lib/mapMarkers';

function placeLngLat(place) {
  if (!hasLngLat(place)) return null;
  return { lng: Number(place.lng), lat: Number(place.lat), label: place.label || '' };
}

function mergeLive(ride, overlay) {
  if (!ride) return ride;
  const live = overlay?.[ride.id];
  if (!live) return ride;
  return {
    ...ride,
    status: live.status || ride.status,
    locationSharing:
      live.locationSharing != null ? live.locationSharing : ride.locationSharing,
    driverLocation:
      live.lng != null
        ? {
            lng: live.lng,
            lat: live.lat,
            heading: live.heading || 0,
            updatedAt: live.updatedAt,
          }
        : ride.driverLocation,
    trail: Array.isArray(live.trail) ? live.trail : ride.trail,
  };
}

/**
 * Compact map for the parent dashboard: booking preview plus a pin/route
 * for every child with an active trip. Live GPS is streamed when the driver
 * has confirmed pickup.
 */
export default function TripRouteMap({
  pickup,
  dropoff,
  className = 'h-48',
  trips = [],
  children = [],
  focusChildId = null,
  onSelectTrip,
}) {
  const container = useRef(null);
  const map = useRef(null);
  const pickupMarker = useRef(null);
  const dropoffMarker = useRef(null);
  const childMarkers = useRef(new Map());
  const lastFitKey = useRef('');
  const lastRouteKey = useRef('');
  const lastRouteAt = useRef(0);
  const overlayRef = useRef({});
  const onSelectTripRef = useRef(onSelectTrip);
  onSelectTripRef.current = onSelectTrip;

  const [ready, setReady] = useState(false);
  const [missingToken, setMissingToken] = useState(false);
  const [liveOverlay, setLiveOverlay] = useState({});

  overlayRef.current = liveOverlay;

  const bookingFrom = placeLngLat(pickup);
  const bookingTo = placeLngLat(dropoff);

  const liveTrips = useMemo(
    () => (trips || []).filter(Boolean).map((t) => mergeLive(t, liveOverlay)),
    [trips, liveOverlay],
  );

  const focusChild =
    (children || []).find((c) => String(c.id) === String(focusChildId)) || null;
  const focusedTrip = rideForChild(liveTrips, focusChild) || null;

  const from = focusedTrip?.pickupCoords
    ? placeLngLat({
        ...focusedTrip.pickupCoords,
        label: focusedTrip.pickup || 'Pickup',
      })
    : bookingFrom;
  const to = focusedTrip?.dropoffCoords
    ? placeLngLat({
        ...focusedTrip.dropoffCoords,
        label: focusedTrip.dropoff || 'Drop-off',
      })
    : bookingTo;

  const tripIds = liveTrips.map((t) => String(t.id)).join(',');

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
      childMarkers.current.forEach((m) => m.remove());
      childMarkers.current.clear();
      if (map.current) {
        map.current.remove();
        map.current = null;
      }
      setReady(false);
    };
    // Camera is updated when pins change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const upsertLine = (sourceId, layerId, feature, paint) => {
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
  };

  const placeMarker = (ref, place, color, fallbackLabel) => {
    if (!map.current) return;
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
      ref.current = new mapboxgl.Marker({ color, scale: 0.85 })
        .setLngLat(lngLat)
        .setPopup(new mapboxgl.Popup({ offset: 16 }).setText(label))
        .addTo(map.current);
    }
  };

  // Pickup / drop-off + route for the focused child (active trip or booking preview)
  useEffect(() => {
    if (!ready || !map.current) return undefined;
    let cancelled = false;

    placeMarker(pickupMarker, from, '#10b981', 'Pickup');
    placeMarker(dropoffMarker, to, '#0ea5e9', 'Drop-off');

    const livePos =
      focusedTrip && canSeeLiveLocation(focusedTrip)
        ? tripPosition(focusedTrip)
        : null;
    const routeFrom = livePos || from;
    const routeKey = [
      focusedTrip?.id || 'booking',
      routeFrom?.lng,
      routeFrom?.lat,
      to?.lng,
      to?.lat,
      livePos ? 'live' : 'plan',
    ].join(':');

    (async () => {
      if (!routeFrom || !to) return;
      // Throttle live reroutes; always draw when the focused trip changes
      const isNewTrip =
        lastRouteKey.current.split(':')[0] !== String(focusedTrip?.id || 'booking');
      if (!isNewTrip && routeKey === lastRouteKey.current) return;
      if (!isNewTrip && livePos && Date.now() - lastRouteAt.current < 12000) {
        return;
      }
      lastRouteKey.current = routeKey;
      lastRouteAt.current = Date.now();
      const route = await fetchDrivingRoute(routeFrom, to, { steps: false });
      if (cancelled || !map.current || !route?.geometry) return;
      upsertLine(
        'trip-route',
        'trip-route-line',
        { type: 'Feature', geometry: route.geometry },
        {
          'line-color': focusedTrip ? colorForKey(focusedTrip.childId || focusedTrip.id) : '#10b981',
          'line-width': 4,
          'line-opacity': 0.85,
        },
      );
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    ready,
    from?.lng,
    from?.lat,
    from?.label,
    to?.lng,
    to?.lat,
    to?.label,
    focusedTrip?.id,
    focusedTrip?.status,
    focusedTrip?.driverLocation?.lng,
    focusedTrip?.driverLocation?.lat,
  ]);

  // One avatar pin per child with an active trip
  useEffect(() => {
    if (!ready || !map.current) return;

    const keep = new Set();
    liveTrips.forEach((ride) => {
      const id = String(ride.id);
      keep.add(id);
      const child = childForRide(children, ride);
      const pos = tripPosition(ride);
      if (!pos) return;
      const focused = focusedTrip && String(focusedTrip.id) === id;
      const color = colorForKey(ride.childId || ride.id);
      const live = !!pos.live;
      let marker = childMarkers.current.get(id);
      if (!marker) {
        const el = createChildPinEl({
          name: child?.name || ride.childName,
          photoUrl: child?.photoUrl,
          color,
          focused,
          live,
        });
        el.addEventListener('click', (ev) => {
          ev.stopPropagation();
          onSelectTripRef.current?.(ride);
        });
        marker = new mapboxgl.Marker({ element: el, anchor: 'center' })
          .setLngLat([pos.lng, pos.lat])
          .setPopup(
            new mapboxgl.Popup({ offset: 18 }).setText(
              `${child?.name || ride.childName || 'Child'} · ${tripStatusLabel(ride.status)}`,
            ),
          )
          .addTo(map.current);
        childMarkers.current.set(id, marker);
      } else {
        marker.setLngLat([pos.lng, pos.lat]);
        const el = marker.getElement?.();
        if (el) {
          el.className = live
            ? 'schoolrun-child-pin schoolrun-child-pin-live'
            : 'schoolrun-child-pin';
          el.style.borderColor = color;
          el.style.width = focused ? '42px' : '32px';
          el.style.height = focused ? '42px' : '32px';
        }
        marker.getPopup()?.setText(
          `${child?.name || ride.childName || 'Child'} · ${tripStatusLabel(ride.status)}`,
        );
      }
    });

    childMarkers.current.forEach((marker, id) => {
      if (!keep.has(id)) {
        marker.remove();
        childMarkers.current.delete(id);
      }
    });

    const fitKey = `${focusedTrip?.id || 'none'}:${tripIds}:${from?.lng}:${to?.lng}`;
    if (fitKey !== lastFitKey.current) {
      lastFitKey.current = fitKey;
      try {
        const bounds = new mapboxgl.LngLatBounds();
        let n = 0;
        const extend = (p) => {
          if (p?.lng != null && p?.lat != null) {
            bounds.extend([p.lng, p.lat]);
            n += 1;
          }
        };
        extend(from);
        extend(to);
        liveTrips.forEach((r) => extend(tripPosition(r)));
        if (n === 1) {
          const p = from || to || tripPosition(liveTrips[0]);
          if (p) {
            map.current.easeTo({
              center: [p.lng, p.lat],
              zoom: 14,
              duration: 400,
            });
          }
        } else if (n >= 2) {
          map.current.fitBounds(bounds, {
            padding: { top: 48, bottom: 72, left: 40, right: 40 },
            maxZoom: 14,
            duration: 500,
          });
        }
      } catch {
        /* ignore */
      }
    }
  }, [
    ready,
    liveTrips,
    children,
    focusedTrip,
    tripIds,
    from,
    to,
  ]);

  // Live GPS for every active trip (socket + poll fallback)
  useEffect(() => {
    const ids = (trips || []).map((t) => t?.id).filter(Boolean);
    if (!ids.length) return undefined;

    const token = localStorage.getItem('schoolrun_token');
    const socket = connectSocket(token);

    const applyLocation = (payload) => {
      if (!payload?.rideId) return;
      const id = String(payload.rideId);
      if (!ids.some((x) => String(x) === id)) return;
      setLiveOverlay((prev) => ({
        ...prev,
        [id]: {
          lng: payload.lng,
          lat: payload.lat,
          heading: payload.heading || 0,
          updatedAt: payload.updatedAt,
          trail: payload.trail,
          status: payload.status || 'in_transit',
          locationSharing:
            payload.locationSharing != null ? payload.locationSharing : true,
        },
      }));
    };

    const onLocation = (payload) => applyLocation(payload);
    const onStatus = (payload) => {
      if (!payload?.rideId) return;
      const id = String(payload.rideId);
      if (!ids.some((x) => String(x) === id)) return;
      setLiveOverlay((prev) => ({
        ...prev,
        [id]: {
          ...(prev[id] || {}),
          status: payload.status || prev[id]?.status,
          locationSharing: !!payload.locationSharing,
          lng: payload.driverLocation?.lng ?? prev[id]?.lng,
          lat: payload.driverLocation?.lat ?? prev[id]?.lat,
          heading: payload.driverLocation?.heading ?? prev[id]?.heading,
          trail: payload.trail || prev[id]?.trail,
        },
      }));
    };

    const join = () => {
      ids.forEach((id) => {
        socket.emit('ride:join', { rideId: id }, (ack) => {
          if (ack?.error) return;
          if (ack?.driverLocation?.lng != null) {
            applyLocation({
              rideId: id,
              lng: ack.driverLocation.lng,
              lat: ack.driverLocation.lat,
              heading: ack.driverLocation.heading,
              updatedAt: ack.driverLocation.updatedAt,
              trail: ack.trail,
              status: ack.status,
              locationSharing: ack.locationSharing,
            });
          } else if (ack?.status) {
            setLiveOverlay((prev) => ({
              ...prev,
              [id]: {
                ...(prev[id] || {}),
                status: ack.status,
                locationSharing: !!ack.locationSharing,
              },
            }));
          }
        });
      });
    };

    if (socket.connected) join();
    else socket.on('connect', join);
    socket.on('ride:location', onLocation);
    socket.on('ride:status', onStatus);

    const poll = setInterval(() => {
      ids.forEach((id) => {
        ridesApi
          .getLocation(id)
          .then((loc) => {
            if (
              loc.locationSharing &&
              loc.status === 'in_transit' &&
              loc.driverLocation?.lng != null
            ) {
              applyLocation({
                rideId: id,
                lng: loc.driverLocation.lng,
                lat: loc.driverLocation.lat,
                heading: loc.driverLocation.heading,
                trail: loc.trail,
                status: loc.status,
                locationSharing: loc.locationSharing,
              });
            } else if (loc.status) {
              setLiveOverlay((prev) => ({
                ...prev,
                [id]: {
                  ...(prev[id] || {}),
                  status: loc.status,
                  locationSharing: !!loc.locationSharing,
                },
              }));
            }
          })
          .catch(() => {});
      });
    }, 8000);

    return () => {
      clearInterval(poll);
      socket.off('ride:location', onLocation);
      socket.off('ride:status', onStatus);
      socket.off('connect', join);
      ids.forEach((id) => socket.emit('ride:leave', { rideId: id }));
    };
  }, [tripIds]); // eslint-disable-line react-hooks/exhaustive-deps

  if (missingToken) {
    return (
      <div
        className={`${className} flex items-center rounded-2xl border border-slate-200 bg-slate-50 px-3 text-sm text-slate-600`}
      >
        Map preview unavailable. Pickup and drop-off addresses are listed above.
      </div>
    );
  }

  if (!from && !to && liveTrips.length === 0) return null;

  const focusedChild = childForRide(children, focusedTrip);
  const focusedLive = canSeeLiveLocation(focusedTrip);
  const focusedName = focusedChild?.name || focusedTrip?.childName || '';

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

      {focusedTrip ? (
        <div className="absolute left-2 top-2 z-10 flex max-w-[75%] flex-col items-start gap-1">
          <div className="rounded-full bg-white/95 px-3 py-1 text-xs font-semibold text-slate-800 shadow">
            <span
              className={`mr-1.5 inline-block h-2 w-2 rounded-full ${
                focusedLive ? 'bg-emerald-500' : 'bg-amber-400'
              }`}
            />
            {focusedName ? `${focusedName} · ` : ''}
            {focusedLive ? 'Live' : tripStatusLabel(focusedTrip.status)}
          </div>
          {focusedTrip.status === 'assigned' || focusedTrip.status === 'in_transit' ? (
            <Link
              to={`/live-tracking?rideId=${focusedTrip.id}`}
              className="rounded-full bg-emerald-600 px-3 py-1 text-[11px] font-semibold text-white shadow hover:bg-emerald-500"
            >
              Full live view
            </Link>
          ) : null}
        </div>
      ) : null}

      {liveTrips.length > 0 ? (
        <div className="absolute inset-x-2 bottom-2 z-10 flex gap-1.5 overflow-x-auto pb-0.5">
          {liveTrips.map((ride) => {
            const child = childForRide(children, ride);
            const selected = focusedTrip && String(focusedTrip.id) === String(ride.id);
            const live = canSeeLiveLocation(ride);
            return (
              <button
                key={ride.id}
                type="button"
                onClick={() => onSelectTrip?.(ride)}
                className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold shadow ${
                  selected
                    ? 'bg-slate-900 text-white'
                    : 'bg-white/95 text-slate-800'
                }`}
              >
                <span
                  className="h-2 w-2 rounded-full"
                  style={{
                    background: live
                      ? '#10b981'
                      : colorForKey(ride.childId || ride.id),
                  }}
                />
                {child?.name || ride.childName || 'Child'}
                <span className={selected ? 'text-white/70' : 'text-slate-500'}>
                  {live ? 'Live' : tripStatusLabel(ride.status)}
                </span>
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
