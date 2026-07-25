import { useEffect, useRef, useState, useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { useAuth } from "../context/AuthContext";
import { ridesApi } from "../lib/api";
import { connectSocket, getSocket } from "../lib/socket";
import {
  DEFAULT_HOME,
  DEFAULT_SCHOOL,
  fetchDrivingRoute,
  formatDistanceKm,
  formatEtaMinutes,
  mapboxToken,
  pickNextStep,
  watchPosition,
} from "../lib/geo";
import { attachMapGeocoder } from "../lib/mapGeocoder";
import MapBottomDrawer from "../components/MapBottomDrawer";

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
    type: "Feature",
    geometry: {
      type: "LineString",
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
  if (!at) return "";
  try {
    return new Date(at).toLocaleTimeString(undefined, {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  } catch {
    return "";
  }
}

function applyRouteMetrics(route, setEta, setDistance, setNavStep, currentPos) {
  if (!route) {
    setEta("Route unavailable");
    setDistance("");
    setNavStep?.(null);
    return;
  }
  const kmLabel = formatDistanceKm(route.distanceKm);
  const etaLabel = formatEtaMinutes(route.etaMinutes);
  setDistance(kmLabel ? `${kmLabel} remaining` : "");
  setEta(etaLabel !== "—" ? `${etaLabel} left` : "Calculating…");
  if (setNavStep) {
    const step = currentPos
      ? pickNextStep(route.steps, currentPos)
      : route.nextStep;
    setNavStep(step);
  }
}

export default function LiveTracking() {
  const mapContainer = useRef(null);
  const map = useRef(null);
  const driverMarker = useRef(null);
  const pickupMarker = useRef(null);
  const dropoffMarker = useRef(null);
  const searchMarker = useRef(null);
  const shareCleanup = useRef(null);
  const geocoderCleanup = useRef(null);
  const trailRef = useRef([]);
  const lastRouteAt = useRef(0);
  const routeStepsRef = useRef([]);
  const lastDriverPos = useRef(null);
  const followDriver = useRef(true);

  const [eta, setEta] = useState("Calculating…");
  const [status, setStatus] = useState("Loading…");
  const [distance, setDistance] = useState("");
  const [error, setError] = useState(null);
  const [mapReady, setMapReady] = useState(false);
  const [ride, setRide] = useState(null);
  const [liveHint, setLiveHint] = useState("");
  const [feed, setFeed] = useState([]);
  const [locationSharing, setLocationSharing] = useState(false);
  const [navStep, setNavStep] = useState(null);
  const [destLabel, setDestLabel] = useState("Destination");
  const [drawerOpen, setDrawerOpen] = useState(true);
  const [searchedPlace, setSearchedPlace] = useState(null);

  const { user } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const rideId = params.get("rideId");
  const isDriver = user?.role === "driver";

  const pickupLngLat = useRef(
    toLngLat(null, [DEFAULT_HOME.lng, DEFAULT_HOME.lat]),
  );
  const dropoffLngLat = useRef(
    toLngLat(null, [DEFAULT_SCHOOL.lng, DEFAULT_SCHOOL.lat]),
  );

  const upsertLine = useCallback((sourceId, layerId, feature, paint) => {
    if (!map.current) return;
    if (map.current.getSource(sourceId)) {
      map.current.getSource(sourceId).setData(feature);
    } else {
      map.current.addSource(sourceId, { type: "geojson", data: feature });
      map.current.addLayer({
        id: layerId,
        type: "line",
        source: sourceId,
        layout: { "line-cap": "round", "line-join": "round" },
        paint,
      });
    }
  }, []);

  const setTrailOnMap = useCallback(
    (trail) => {
      trailRef.current = trail || [];
      const feature = trailToGeoJSON(trailRef.current);
      if (!feature.geometry.coordinates.length) return;
      upsertLine("driver-trail", "driver-trail-line", feature, {
        "line-color": "#2563eb",
        "line-width": 7,
        "line-opacity": 0.95,
      });
    },
    [upsertLine],
  );

  const moveDriverMarker = useCallback(
    (lng, lat, heading = 0, visible = true) => {
      if (!driverMarker.current || !map.current) return;
      const el = driverMarker.current.getElement?.();
      if (el) el.style.display = visible ? "block" : "none";
      if (!visible) return;
      driverMarker.current.setLngLat([lng, lat]);
      if (typeof driverMarker.current.setRotation === "function") {
        driverMarker.current.setRotation(heading || 0);
      }
      lastDriverPos.current = { lng, lat, heading: heading || 0 };

      // Keep map following the driver during active navigation
      if (followDriver.current) {
        map.current.easeTo({
          center: [lng, lat],
          bearing: heading || map.current.getBearing(),
          duration: 700,
        });
      } else {
        const center = map.current.getCenter();
        const dx = Math.abs(center.lng - lng);
        const dy = Math.abs(center.lat - lat);
        if (dx > 0.008 || dy > 0.008) {
          map.current.easeTo({ center: [lng, lat], duration: 800 });
        }
      }

      // Refresh next-turn from last route steps without re-fetching
      if (routeStepsRef.current.length) {
        setNavStep(pickNextStep(routeStepsRef.current, { lng, lat }));
      }
    },
    [],
  );

  const hideDriverMarker = useCallback(() => {
    if (!driverMarker.current) return;
    const el = driverMarker.current.getElement?.();
    if (el) el.style.display = "none";
  }, []);

  /**
   * Active navigation target for the driver:
   * - assigned → go to pickup
   * - in_transit / default → go to drop-off
   */
  const getNavDestination = useCallback((rideDoc) => {
    const pickup = toLngLat(rideDoc?.pickupCoords, pickupLngLat.current);
    const dropoff = toLngLat(rideDoc?.dropoffCoords, dropoffLngLat.current);
    if (rideDoc?.status === "assigned") {
      return {
        coords: pickup,
        label: rideDoc?.pickup || "Pickup",
        phase: "to_pickup",
      };
    }
    return {
      coords: dropoff,
      label: rideDoc?.dropoff || "Drop-off",
      phase: "to_dropoff",
    };
  }, []);

  /** Full planned route pickup → dropoff (always shown as reference) */
  const loadPlannedRoute = useCallback(
    async (from, to) => {
      if (!map.current || !from || !to) return;
      const route = await fetchDrivingRoute(from, to, { steps: false });
      if (!route?.geometry) {
        setEta("Route unavailable");
        return;
      }
      // Only set global ETA/distance when we don't yet have a live remaining route
      if (!lastRouteAt.current) {
        applyRouteMetrics(route, setEta, setDistance, null, null);
      }
      upsertLine(
        "planned-route",
        "planned-route-line",
        { type: "Feature", geometry: route.geometry },
        {
          "line-color": "#93c5fd",
          "line-width": 5,
          "line-opacity": 0.55,
          "line-dasharray": [1.5, 1.5],
        },
      );
    },
    [upsertLine],
  );

  /**
   * Live remaining route from current position → active destination.
   * Distance is road km from Mapbox; ETA is calculated from that km.
   */
  const loadRemainingRoute = useCallback(
    async (from, to, { force = false, withSteps = false } = {}) => {
      if (!map.current || !from || !to) return null;
      const now = Date.now();
      // Throttle Directions API (still re-pick next step locally between fetches)
      if (!force && now - lastRouteAt.current < 10000) {
        if (routeStepsRef.current.length && Array.isArray(from)) {
          setNavStep(
            pickNextStep(routeStepsRef.current, {
              lng: from[0],
              lat: from[1],
            }),
          );
        }
        return null;
      }
      lastRouteAt.current = now;

      const route = await fetchDrivingRoute(from, to, {
        steps: withSteps || isDriver,
      });
      if (!route) return null;

      routeStepsRef.current = route.steps || [];
      const pos = Array.isArray(from) ? { lng: from[0], lat: from[1] } : from;
      applyRouteMetrics(route, setEta, setDistance, setNavStep, pos);

      upsertLine(
        "remaining-route",
        "remaining-route-line",
        { type: "Feature", geometry: route.geometry },
        {
          "line-color": "#10b981",
          "line-width": isDriver ? 6 : 4,
          "line-opacity": 0.9,
        },
      );
      return route;
    },
    [upsertLine, isDriver],
  );

  /** Driver: re-route from current GPS to pickup or drop-off */
  const refreshDriverNav = useCallback(
    async (pos, rideDoc, { force = false } = {}) => {
      if (!pos || pos.lng == null || pos.lat == null) return;
      const dest = getNavDestination(rideDoc);
      setDestLabel(dest.label);
      await loadRemainingRoute([pos.lng, pos.lat], dest.coords, {
        force,
        withSteps: true,
      });
    },
    [getNavDestination, loadRemainingRoute],
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
          setStatus(String(r.status || "active").replace(/_/g, " "));
          setLocationSharing(!!r.locationSharing);
          setFeed(Array.isArray(r.transitFeed) ? r.transitFeed : []);
          pickupLngLat.current = toLngLat(r.pickupCoords, [
            DEFAULT_HOME.lng,
            DEFAULT_HOME.lat,
          ]);
          dropoffLngLat.current = toLngLat(r.dropoffCoords, [
            DEFAULT_SCHOOL.lng,
            DEFAULT_SCHOOL.lat,
          ]);
          if (Array.isArray(r.trail)) trailRef.current = r.trail;

          if (r.status === "assigned" && !r.locationSharing) {
            setLiveHint("Waiting for driver to confirm pickup…");
          } else if (r.status === "completed") {
            setLiveHint("Trip completed · location sharing stopped");
          } else if (r.locationSharing) {
            setLiveHint("Live tracking active");
          }
        } else {
          setStatus("Demo trip");
          setLiveHint("No active ride — showing demo route");
        }
      } catch {
        if (!cancelled) {
          setStatus("Demo trip");
          setLiveHint("Could not load ride — showing demo route");
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
      setError(
        "Missing Mapbox token. Add VITE_MAPBOX_TOKEN to your .env file.",
      );
      setEta("~12 mins");
      setDistance("2.4 km");
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
        style: "mapbox://styles/mapbox/streets-v12",
        center: mid,
        zoom: 13.5,
        pitch: 40,
      });
      map.current.addControl(
        new mapboxgl.NavigationControl({ showCompass: false }),
        "top-right",
      );

      // Pause follow when user pans the map
      map.current.on("dragstart", () => {
        followDriver.current = false;
      });

      map.current.on("load", () => {
        if (cancelled || !map.current) return;

        pickupMarker.current = new mapboxgl.Marker({ color: "#10b981" })
          .setLngLat(from)
          .setPopup(new mapboxgl.Popup().setText(ride?.pickup || "Pickup"))
          .addTo(map.current);

        dropoffMarker.current = new mapboxgl.Marker({ color: "#0ea5e9" })
          .setLngLat(to)
          .setPopup(new mapboxgl.Popup().setText(ride?.dropoff || "Drop-off"))
          .addTo(map.current);

        const el = document.createElement("div");
        el.textContent = "🚗";
        el.style.fontSize = "34px";
        el.style.lineHeight = "1";
        el.style.filter = "drop-shadow(0 2px 4px rgba(0,0,0,0.35))";
        el.style.display = "none";

        driverMarker.current = new mapboxgl.Marker({
          element: el,
          rotationAlignment: "map",
        })
          .setLngLat(from)
          .addTo(map.current);

        // Location search for parents + drivers
        geocoderCleanup.current = attachMapGeocoder(map.current, {
          position: "top-left",
          placeholder: isDriver
            ? "Search a place to navigate…"
            : "Search address or place…",
          marker: false,
          flyTo: true,
          onResult: ({ label, lng, lat }) => {
            followDriver.current = false;
            setSearchedPlace({ label, lng, lat });
            if (searchMarker.current) {
              searchMarker.current.setLngLat([lng, lat]);
              searchMarker.current.getPopup()?.setText(label);
            } else if (map.current) {
              searchMarker.current = new mapboxgl.Marker({ color: "#f59e0b" })
                .setLngLat([lng, lat])
                .setPopup(new mapboxgl.Popup({ offset: 16 }).setText(label))
                .addTo(map.current);
            }
            searchMarker.current?.togglePopup();
            // Drivers: show remaining route from current position (or pickup) to searched place
            if (isDriver) {
              const fromPos = lastDriverPos.current
                ? [lastDriverPos.current.lng, lastDriverPos.current.lat]
                : pickupLngLat.current;
              loadRemainingRoute(fromPos, [lng, lat], {
                force: true,
                withSteps: true,
              });
              setDestLabel(label);
              setLiveHint((h) => h || `Navigating toward searched place`);
            }
          },
          onClear: () => {
            setSearchedPlace(null);
            searchMarker.current?.remove();
            searchMarker.current = null;
          },
        });

        setMapReady(true);
        loadPlannedRoute(from, to);
        if (trailRef.current.length) setTrailOnMap(trailRef.current);

        try {
          const bounds = new mapboxgl.LngLatBounds();
          bounds.extend(from);
          bounds.extend(to);
          map.current.fitBounds(bounds, {
            padding: { top: 120, bottom: 160, left: 60, right: 60 },
            maxZoom: 15,
            duration: 600,
          });
        } catch {
          /* ignore */
        }
      });

      map.current.on("error", () => {
        setError("Map failed to load. Check your Mapbox token and network.");
      });
    } catch (err) {
      setError(`Failed to load map: ${err.message}`);
    }

    return () => {
      cancelled = true;
      if (shareCleanup.current) shareCleanup.current();
      geocoderCleanup.current?.();
      geocoderCleanup.current = null;
      searchMarker.current?.remove();
      searchMarker.current = null;
      driverMarker.current = null;
      pickupMarker.current = null;
      dropoffMarker.current = null;
      if (map.current) {
        map.current.remove();
        map.current = null;
      }
    };
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

    const canSeeLive =
      isDriver || (ride.locationSharing && ride.status === "in_transit");

    if (canSeeLive && ride.driverLocation?.lng != null) {
      moveDriverMarker(
        ride.driverLocation.lng,
        ride.driverLocation.lat,
        ride.driverLocation.heading,
        true,
      );
      if (isDriver) {
        refreshDriverNav(
          {
            lng: ride.driverLocation.lng,
            lat: ride.driverLocation.lat,
          },
          ride,
          { force: true },
        );
      } else {
        loadRemainingRoute(
          [ride.driverLocation.lng, ride.driverLocation.lat],
          to,
          { force: true },
        );
      }
    } else if (isDriver) {
      // Driver always navigates even before sharing (en route to pickup)
      hideDriverMarker();
      setDestLabel(getNavDestination(ride).label);
    } else {
      hideDriverMarker();
    }

    if (canSeeLive && ride.trail?.length) setTrailOnMap(ride.trail);
    loadPlannedRoute(from, to);
  }, [
    ride,
    mapReady,
    isDriver,
    moveDriverMarker,
    hideDriverMarker,
    setTrailOnMap,
    loadPlannedRoute,
    loadRemainingRoute,
    refreshDriverNav,
    getNavDestination,
  ]);

  // Socket: join ride room + receive location / status; driver shares only while in transit
  useEffect(() => {
    const id = ride?.id || rideId;
    if (!id || !user) return undefined;

    const token = localStorage.getItem("schoolrun_token");
    const socket = connectSocket(token);

    const onLocation = (payload) => {
      if (!payload || String(payload.rideId) !== String(id)) return;
      if (payload.locationSharing === false) {
        setLocationSharing(false);
        if (!isDriver) hideDriverMarker();
        setLiveHint("Location sharing stopped");
        return;
      }
      setLocationSharing(true);
      if (payload.lng != null && payload.lat != null) {
        moveDriverMarker(payload.lng, payload.lat, payload.heading, true);
        if (!isDriver) {
          loadRemainingRoute([payload.lng, payload.lat], dropoffLngLat.current);
        }
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
      if (Array.isArray(payload.transitFeed)) {
        setFeed(payload.transitFeed);
      }
      setLiveHint("Live · driver en route to drop-off");
      setStatus("in transit");
    };

    const onStatus = (payload) => {
      if (!payload || String(payload.rideId) !== String(id)) return;
      if (payload.status) {
        setStatus(String(payload.status).replace(/_/g, " "));
        setRide((prev) =>
          prev
            ? {
                ...prev,
                status: payload.status,
                locationSharing: !!payload.locationSharing,
                pickedUpAt: payload.pickedUpAt ?? prev.pickedUpAt,
                deliveredAt: payload.deliveredAt ?? prev.deliveredAt,
                transitFeed: payload.transitFeed || prev.transitFeed,
              }
            : prev,
        );
      }
      setLocationSharing(!!payload.locationSharing);
      if (Array.isArray(payload.transitFeed)) setFeed(payload.transitFeed);

      if (payload.status === "in_transit" && payload.locationSharing) {
        setLiveHint("Pickup confirmed · live tracking started");
        if (payload.driverLocation?.lng != null) {
          moveDriverMarker(
            payload.driverLocation.lng,
            payload.driverLocation.lat,
            payload.driverLocation.heading,
            true,
          );
        }
        if (payload.trail?.length) setTrailOnMap(payload.trail);
      }

      if (payload.status === "completed" || payload.locationSharing === false) {
        setLiveHint("Drop-off complete · location sharing stopped");
        hideDriverMarker();
      }
    };

    const join = () => {
      socket.emit("ride:join", { rideId: id }, (ack) => {
        if (ack?.error) return;
        setLocationSharing(!!ack.locationSharing);
        if (ack.status) setStatus(String(ack.status).replace(/_/g, " "));
        if (Array.isArray(ack.transitFeed)) setFeed(ack.transitFeed);

        const canSee =
          isDriver || (ack.locationSharing && ack.status === "in_transit");

        if (canSee && ack?.driverLocation?.lng != null) {
          moveDriverMarker(
            ack.driverLocation.lng,
            ack.driverLocation.lat,
            ack.driverLocation.heading,
            true,
          );
          if (!isDriver) {
            loadRemainingRoute(
              [ack.driverLocation.lng, ack.driverLocation.lat],
              dropoffLngLat.current,
              { force: true },
            );
          }
        } else if (!isDriver) {
          hideDriverMarker();
          if (ack.status === "assigned") {
            setLiveHint("Waiting for driver to confirm pickup…");
          }
        }
        if (canSee && ack?.trail?.length) setTrailOnMap(ack.trail);
      });
    };

    if (socket.connected) join();
    else socket.on("connect", join);

    socket.on("ride:location", onLocation);
    socket.on("ride:status", onStatus);

    // Driver: always navigate from GPS; share location only after pickup confirmed
    const isAssignedDriver =
      isDriver && ride?.driverId === user.id && ride?.status !== "completed";

    const driverCanShare =
      isAssignedDriver &&
      ride?.status === "in_transit" &&
      ride?.locationSharing !== false;

    if (isAssignedDriver) {
      followDriver.current = true;
      setLiveHint(
        ride?.status === "assigned"
          ? "Navigate to pickup · parent cannot track you yet"
          : driverCanShare
            ? "Navigating to drop-off · sharing live with parent"
            : "Navigating to drop-off",
      );
      setDestLabel(getNavDestination(ride).label);

      shareCleanup.current = watchPosition(
        (pos) => {
          moveDriverMarker(pos.lng, pos.lat, pos.heading || 0, true);
          refreshDriverNav(pos, ride);

          if (driverCanShare) {
            const s = getSocket();
            if (s?.connected) {
              s.emit(
                "ride:location",
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
          }
        },
        () => {
          setLiveHint("Enable device location for turn-by-turn directions");
        },
      );
    } else if (!isDriver) {
      if (ride?.status === "assigned" || !locationSharing) {
        setLiveHint((h) => h || "Waiting for driver to confirm pickup…");
      }
      const poll = setInterval(() => {
        ridesApi
          .getLocation(id)
          .then((loc) => {
            setLocationSharing(!!loc.locationSharing);
            if (loc.status) setStatus(String(loc.status).replace(/_/g, " "));
            if (Array.isArray(loc.transitFeed)) setFeed(loc.transitFeed);

            if (
              loc.locationSharing &&
              loc.status === "in_transit" &&
              loc.driverLocation?.lng != null
            ) {
              moveDriverMarker(
                loc.driverLocation.lng,
                loc.driverLocation.lat,
                loc.driverLocation.heading,
                true,
              );
              loadRemainingRoute(
                [loc.driverLocation.lng, loc.driverLocation.lat],
                dropoffLngLat.current,
              );
              if (loc.trail?.length) setTrailOnMap(loc.trail);
              setLiveHint("Live · driver en route to drop-off");
            } else if (loc.status === "completed") {
              hideDriverMarker();
              setLiveHint("Trip completed · location sharing stopped");
            } else if (!loc.locationSharing) {
              hideDriverMarker();
            }
          })
          .catch(() => {});
      }, 8000);
      shareCleanup.current = () => clearInterval(poll);
    }

    return () => {
      socket.off("ride:location", onLocation);
      socket.off("ride:status", onStatus);
      socket.off("connect", join);
      socket.emit("ride:leave", { rideId: id });
      if (shareCleanup.current) {
        shareCleanup.current();
        shareCleanup.current = null;
      }
    };
  }, [
    ride?.id,
    ride?.driverId,
    ride?.status,
    ride?.locationSharing,
    ride?.pickup,
    ride?.dropoff,
    ride?.pickupCoords,
    ride?.dropoffCoords,
    rideId,
    user,
    isDriver,
    locationSharing,
    moveDriverMarker,
    hideDriverMarker,
    setTrailOnMap,
    loadRemainingRoute,
    refreshDriverNav,
    getNavDestination,
    ride,
  ]);

  const markDelivered = async () => {
    if (ride?.id) {
      try {
        await ridesApi.setStatus(ride.id, "completed");
      } catch {
        /* ignore */
      }
    }
    setStatus("Delivered");
    setLocationSharing(false);
    setEta("Trip completed");
    setLiveHint("Drop-off complete · location sharing stopped");
    hideDriverMarker();
    setFeed((prev) => [
      ...prev,
      {
        type: "delivered",
        message: "Drop-off complete. Location sharing stopped.",
        at: new Date().toISOString(),
      },
    ]);
    navigate(user?.role === "driver" ? "/driver" : "/dashboard");
  };

  const confirmPickup = async () => {
    if (!ride?.id) return;
    try {
      const { ride: updated } = await ridesApi.setStatus(ride.id, "in_transit");
      setRide(updated);
      setLocationSharing(true);
      setStatus("in transit");
      setLiveHint("Pickup confirmed · sharing location with parent");
      if (Array.isArray(updated.transitFeed)) setFeed(updated.transitFeed);
    } catch (err) {
      setError(err.message);
    }
  };

  const feedNewestFirst = [...feed].reverse().slice(0, 12);

  const recenterOnDriver = () => {
    followDriver.current = true;
    const pos = lastDriverPos.current;
    if (pos && map.current) {
      map.current.easeTo({
        center: [pos.lng, pos.lat],
        zoom: Math.max(map.current.getZoom(), 14),
        bearing: pos.heading || 0,
        duration: 600,
      });
    }
  };

  const drawerSummary = (
    <div className="flex min-w-0 items-center gap-3">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-bold capitalize text-slate-900">
          {status}
        </p>
        <p className="truncate text-xs text-slate-500">
          {liveHint || (isDriver ? `Toward ${destLabel}` : "Trip details")}
        </p>
      </div>
      <div className="shrink-0 text-right font-mono">
        <p className="text-sm font-bold text-emerald-700">{eta}</p>
        {distance && <p className="text-[10px] text-slate-500">{distance}</p>}
      </div>
    </div>
  );

  return (
    <div className="map-fullscreen map-geocoder-host">
      <div ref={mapContainer} className="absolute inset-0 h-full w-full" />

      {!mapReady && !error && (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center bg-slate-100/80">
          <p className="rounded-full bg-white px-4 py-2 text-sm font-medium text-slate-600 shadow">
            Loading map…
          </p>
        </div>
      )}

      {error && (
        <div className="absolute inset-x-4 top-24 z-30 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 shadow">
          <p className="font-semibold">Map unavailable</p>
          <p className="mt-1">{error}</p>
        </div>
      )}

      {/* Top chrome */}
      <div className="pointer-events-none absolute left-0 right-0 top-0 z-30 flex items-start justify-between gap-2 p-3">
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="pointer-events-auto flex h-11 w-11 items-center justify-center rounded-full bg-white text-xl shadow"
        >
          ←
        </button>
        <div className="pointer-events-auto flex max-w-[55%] flex-col items-center">
          <div className="inline-flex max-w-full flex-col items-center rounded-2xl bg-emerald-600 px-3 py-1.5 text-white shadow">
            <span className="truncate text-xs font-semibold capitalize sm:text-sm">
              {status}
            </span>
          </div>
        </div>
        <div className="pointer-events-auto flex gap-2">
          <button
            type="button"
            onClick={() => setDrawerOpen((o) => !o)}
            className="h-11 rounded-full bg-white px-3 text-xs font-semibold text-slate-700 shadow"
          >
            {drawerOpen ? "Map" : "Details"}
          </button>
          <button
            type="button"
            onClick={() =>
              alert("SOS sent to SchoolRun safety team and emergency contacts.")
            }
            className="h-11 rounded-full bg-red-600 px-3 text-sm font-bold text-white shadow"
          >
            SOS
          </button>
        </div>
      </div>

      {/* Floating map actions */}
      <div
        className={`absolute right-3 z-20 flex flex-col gap-2 transition-all ${
          drawerOpen ? "bottom-[calc(min(58vh,520px)+0.75rem)]" : "bottom-28"
        }`}
      >
        <button
          type="button"
          onClick={recenterOnDriver}
          className="rounded-full bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow"
          title="Follow driver"
        >
          Recenter
        </button>
      </div>

      {/* Turn-by-turn banner for drivers (always visible above drawer) */}
      {isDriver && navStep?.instruction && (
        <div
          className={`absolute left-3 right-3 z-20 rounded-2xl bg-slate-900/95 px-4 py-3 text-white shadow-lg backdrop-blur transition-all ${
            drawerOpen ? "bottom-[calc(min(58vh,520px)+0.5rem)]" : "bottom-24"
          }`}
        >
          <p className="text-[10px] font-semibold uppercase tracking-widest text-emerald-300">
            Next · {destLabel}
          </p>
          <p className="mt-0.5 text-sm font-semibold leading-snug">
            {navStep.instruction}
          </p>
          {navStep.distanceKm != null && (
            <p className="mt-0.5 text-xs text-slate-300">
              in {formatDistanceKm(navStep.distanceKm) || "—"}
              {distance ? ` · ${distance}` : ""}
            </p>
          )}
        </div>
      )}

      <MapBottomDrawer
        open={drawerOpen}
        onToggle={() => setDrawerOpen((o) => !o)}
        summary={drawerSummary}
        maxHeight="58vh"
      >
        <div className="mb-3 flex flex-wrap items-center gap-2 text-xs text-slate-500">
          <span className="inline-flex items-center gap-1">
            <span className="h-2 w-2 rounded-full bg-emerald-500" /> Pickup
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="h-2 w-2 rounded-full bg-sky-500" /> Drop-off
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="h-2 w-6 rounded-sm bg-sky-300 opacity-70" />{" "}
            Planned
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="h-2 w-6 rounded-full bg-blue-600" /> Live trail
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="h-2 w-6 rounded-full bg-emerald-500" /> Remaining
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="h-2 w-2 rounded-full bg-amber-500" /> Search
          </span>
        </div>

        {searchedPlace && (
          <p className="mb-3 truncate rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-900">
            Searched: {searchedPlace.label}
          </p>
        )}

        <div className="mb-4 space-y-1 text-sm text-slate-600">
          <p className="truncate">
            <span className="font-medium text-slate-800">From:</span>{" "}
            {ride?.pickup || DEFAULT_HOME.label}
          </p>
          <p className="truncate">
            <span className="font-medium text-slate-800">To:</span>{" "}
            {ride?.dropoff || DEFAULT_SCHOOL.label}
          </p>
          {isDriver && (
            <p className="truncate text-xs text-emerald-700">
              Nav target: {destLabel}
            </p>
          )}
        </div>

        <div className="mb-5 flex items-center gap-4">
          <div className="text-4xl">👨‍✈️</div>
          <div className="min-w-0 flex-1">
            <h3 className="truncate text-lg font-bold text-slate-900">
              {ride?.driverName || user?.driverName || "Driver"}
            </h3>
            <p className="text-sm text-slate-500">
              Plate: {ride?.vehiclePlate || user?.vehiclePlate || "—"}
            </p>
            {ride?.childName && (
              <p className="text-xs text-slate-400">Child: {ride.childName}</p>
            )}
          </div>
          <div className="text-right font-mono">
            <div className="text-xl font-bold text-slate-900">{eta}</div>
            {distance && (
              <div className="text-xs text-slate-500">{distance}</div>
            )}
          </div>
        </div>

        <div className="mb-5 rounded-2xl border border-slate-200 bg-slate-50 p-3">
          <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-slate-500">
            Live feed
          </p>
          {feedNewestFirst.length === 0 ? (
            <p className="text-sm text-slate-500">
              {ride?.status === "assigned"
                ? "No live updates yet. Feed starts when the driver confirms pickup."
                : "Waiting for transit updates…"}
            </p>
          ) : (
            <ul className="max-h-32 space-y-2 overflow-y-auto">
              {feedNewestFirst.map((item, i) => (
                <li
                  key={`${item.at}-${i}`}
                  className="flex gap-2 border-b border-slate-100 pb-2 text-sm last:border-0 last:pb-0"
                >
                  <span className="shrink-0 font-mono text-[10px] text-slate-400">
                    {formatFeedTime(item.at)}
                  </span>
                  <span
                    className={
                      item.type === "delivered"
                        ? "font-medium text-emerald-700"
                        : item.type === "pickup_confirmed"
                          ? "font-medium text-indigo-700"
                          : "text-slate-700"
                    }
                  >
                    {item.message}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="mb-6 rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-5 text-center">
          <p className="text-xs uppercase tracking-widest text-slate-500">
            Handover PIN
          </p>
          <p className="mt-1 font-mono text-5xl font-black tracking-widest text-slate-900">
            {ride?.handoverPin || "—"}
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() =>
              navigate(ride?.id ? `/chat?rideId=${ride.id}` : "/chat")
            }
            className="rounded-2xl bg-slate-100 py-4 font-semibold text-slate-800"
          >
            Open chat
          </button>
          {isDriver && ride?.status === "assigned" ? (
            <button
              type="button"
              onClick={confirmPickup}
              className="rounded-2xl bg-emerald-600 py-4 font-semibold text-white"
            >
              Confirm pickup
            </button>
          ) : (
            <button
              type="button"
              onClick={markDelivered}
              className="rounded-2xl bg-slate-900 py-4 font-semibold text-white"
            >
              Mark delivered
            </button>
          )}
        </div>
      </MapBottomDrawer>
    </div>
  );
}
