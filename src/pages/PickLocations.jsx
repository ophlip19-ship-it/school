import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { MapPin, Home, Navigation, School, Map, ArrowUpDown } from 'lucide-react';
import { getBookingDraft, setBookingDraft } from '../lib/booking';
import { useAuth } from '../context/AuthContext';
import { formatMoney } from '../lib/api';
import {
  DEFAULT_HOME,
  getCurrentPosition,
  mapboxToken,
  resolvePlace,
  reverseGeocode,
  captureParentLocationForBooking,
  schoolLabelFromChild,
  schoolCoordsFromChild,
  schoolResolveArgsFromChild,
  fetchDrivingRoute,
  formatDistanceKm,
  formatEtaMinutes,
  childHasSchool,
} from '../lib/geo';
import { quoteTripFare } from '../lib/pricing';
import {
  modesForTripType,
  tripTypeFromModes,
  tripTypeHint,
  swapPlaces,
} from '../lib/trip';
import { attachMapGeocoder } from '../lib/mapGeocoder';
import MapBottomDrawer from '../components/MapBottomDrawer';
import AddressSearchInput from '../components/AddressSearchInput';

export default function PickLocations() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const draft = getBookingDraft();
  const selectedChild =
    (user?.children || []).find((c) => c.id === draft.childId) ||
    user?.children?.[0] ||
    null;
  const childSchool = schoolResolveArgsFromChild(selectedChild);
  const school =
    childSchool.schoolAddress ||
    draft.schoolAddress ||
    draft.school ||
    schoolLabelFromChild(selectedChild) ||
    '';
  const schoolCoords =
    childSchool.schoolCoords ||
    draft.schoolCoords ||
    schoolCoordsFromChild(selectedChild) ||
    null;
  const homeAddress = user?.homeAddress || 'Home · 12 Admiralty Way, Lekki';

  const mapContainer = useRef(null);
  const map = useRef(null);
  const pickupMarker = useRef(null);
  const dropoffMarker = useRef(null);
  const searchMarker = useRef(null);
  const geocoderCleanup = useRef(null);

  const initialModes = draft.pickupMode || draft.dropoffMode
    ? {
        pickupMode: draft.pickupMode || 'home',
        dropoffMode: draft.dropoffMode || 'school',
      }
    : modesForTripType(draft.tripType || 'dropoff');
  const [pickupMode, setPickupMode] = useState(initialModes.pickupMode);
  const [dropoffMode, setDropoffMode] = useState(initialModes.dropoffMode);
  const [customPickup, setCustomPickup] = useState(draft.customPickup || '');
  const [customDropoff, setCustomDropoff] = useState(draft.customDropoff || '');
  const [pickupPlace, setPickupPlace] = useState(
    draft.pickupCoords
      ? {
          label: draft.pickup || homeAddress,
          lng: draft.pickupCoords.lng,
          lat: draft.pickupCoords.lat,
        }
      : null,
  );
  const [dropoffPlace, setDropoffPlace] = useState(
    draft.dropoffCoords
      ? {
          label: draft.dropoff || school,
          lng: draft.dropoffCoords.lng,
          lat: draft.dropoffCoords.lat,
        }
      : null,
  );
  const [activeField, setActiveField] = useState('pickup'); // pickup | dropoff
  const [drawerOpen, setDrawerOpen] = useState(true);
  const [mapReady, setMapReady] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [mapError, setMapError] = useState('');
  const [fareQuote, setFareQuote] = useState(null);

  const placeMarker = useCallback((kind, place) => {
    if (!map.current || !place || place.lng == null || place.lat == null) return;
    const color = kind === 'pickup' ? '#10b981' : '#0ea5e9';
    const ref = kind === 'pickup' ? pickupMarker : dropoffMarker;
    if (ref.current) {
      ref.current.setLngLat([place.lng, place.lat]);
      ref.current.getPopup()?.setText(place.label || kind);
    } else {
      ref.current = new mapboxgl.Marker({ color })
        .setLngLat([place.lng, place.lat])
        .setPopup(new mapboxgl.Popup({ offset: 18 }).setText(place.label || kind))
        .addTo(map.current);
    }
  }, []);

  const fitPlaces = useCallback((a, b) => {
    if (!map.current) return;
    try {
      const bounds = new mapboxgl.LngLatBounds();
      let n = 0;
      if (a?.lng != null) {
        bounds.extend([a.lng, a.lat]);
        n += 1;
      }
      if (b?.lng != null) {
        bounds.extend([b.lng, b.lat]);
        n += 1;
      }
      if (n === 1) {
        const p = a?.lng != null ? a : b;
        map.current.easeTo({ center: [p.lng, p.lat], zoom: 14, duration: 500 });
      } else if (n >= 2) {
        map.current.fitBounds(bounds, { padding: 90, maxZoom: 14, duration: 600 });
      }
    } catch {
      /* ignore */
    }
  }, []);

  // Init map + geocoder
  useEffect(() => {
    const token = mapboxToken();
    if (!token) {
      setMapError('Missing Mapbox token. Add VITE_MAPBOX_TOKEN to your .env file.');
      return undefined;
    }
    if (!mapContainer.current || map.current) return undefined;

    mapboxgl.accessToken = token;
    map.current = new mapboxgl.Map({
      container: mapContainer.current,
      style: 'mapbox://styles/mapbox/streets-v12',
      center: [DEFAULT_HOME.lng, DEFAULT_HOME.lat],
      zoom: 12.5,
    });
    map.current.addControl(new mapboxgl.NavigationControl({ showCompass: false }), 'top-right');

    map.current.on('load', () => {
      setMapReady(true);
      geocoderCleanup.current = attachMapGeocoder(map.current, {
        position: 'top-left',
        placeholder: 'Search address or place…',
        marker: false,
        flyTo: true,
        onResult: ({ label, lng, lat }) => {
          if (searchMarker.current) {
            searchMarker.current.setLngLat([lng, lat]);
          } else if (map.current) {
            searchMarker.current = new mapboxgl.Marker({ color: '#f59e0b' })
              .setLngLat([lng, lat])
              .setPopup(new mapboxgl.Popup({ offset: 16 }).setText(label))
              .addTo(map.current);
          }
          // Apply search to the active field (pickup or dropoff)
          setActiveField((field) => {
            if (field === 'dropoff') {
              setDropoffMode('custom');
              setCustomDropoff(label);
              setDropoffPlace({ label, lng, lat });
            } else {
              setPickupMode('custom');
              setCustomPickup(label);
              setPickupPlace({ label, lng, lat });
            }
            return field;
          });
        },
      });
    });

    map.current.on('error', () => {
      setMapError('Map failed to load. Check your Mapbox token and network.');
    });

    // Tap map to set active pin
    map.current.on('click', async (e) => {
      const { lng, lat } = e.lngLat;
      let label = `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
      try {
        label = await reverseGeocode(lng, lat);
      } catch {
        /* keep coords */
      }
      setActiveField((field) => {
        if (field === 'dropoff') {
          setDropoffMode('custom');
          setCustomDropoff(label);
          setDropoffPlace({ label, lng, lat });
        } else {
          setPickupMode('custom');
          setCustomPickup(label);
          setPickupPlace({ label, lng, lat });
        }
        return field;
      });
    });

    return () => {
      geocoderCleanup.current?.();
      geocoderCleanup.current = null;
      pickupMarker.current?.remove();
      dropoffMarker.current?.remove();
      searchMarker.current?.remove();
      pickupMarker.current = null;
      dropoffMarker.current = null;
      searchMarker.current = null;
      if (map.current) {
        map.current.remove();
        map.current = null;
      }
    };
  }, []);

  const placeArgs = {
    child: selectedChild,
    homeAddress,
    homeCoords: user?.homeCoords,
    schoolName: childSchool.schoolName || school,
    schoolAddress: school,
    schoolCoords,
  };

  // Resolve home/school/current when mode changes (not custom pin)
  useEffect(() => {
    if (!mapReady) return undefined;
    if (pickupMode === 'custom') return undefined;
    let cancelled = false;

    (async () => {
      try {
        const from = await resolvePlace({
          mode: pickupMode,
          ...placeArgs,
        });
        if (!cancelled) {
          setPickupPlace(from);
          if (pickupMode === 'current') setCustomPickup(from.label);
        }
      } catch (err) {
        if (!cancelled) {
          setError(
            err?.message?.includes('denied') || err?.code === 1
              ? 'Location permission denied. Allow location or choose Home / School / search.'
              : err.message || 'Could not resolve pickup',
          );
        }
      }
    })();

    return () => {
      cancelled = true;
    };
    // placeArgs fields listed explicitly
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pickupMode, mapReady, homeAddress, user?.homeCoords, school, schoolCoords]);

  useEffect(() => {
    if (!mapReady) return undefined;
    if (dropoffMode === 'custom') return undefined;
    let cancelled = false;

    (async () => {
      try {
        const to = await resolvePlace({
          mode: dropoffMode,
          ...placeArgs,
        });
        if (!cancelled) setDropoffPlace(to);
      } catch (err) {
        if (!cancelled) {
          setError(err.message || 'Could not resolve drop-off');
        }
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dropoffMode, mapReady, school, schoolCoords, homeAddress, user?.homeCoords]);

  // Sync markers + fit
  useEffect(() => {
    if (!mapReady) return;
    if (pickupPlace) placeMarker('pickup', pickupPlace);
    if (dropoffPlace) placeMarker('dropoff', dropoffPlace);
    fitPlaces(pickupPlace, dropoffPlace);
  }, [mapReady, pickupPlace, dropoffPlace, placeMarker, fitPlaces]);

  // Draw driving route and quote fare once both pins are set
  useEffect(() => {
    if (!mapReady || !map.current || !pickupPlace || !dropoffPlace) {
      setFareQuote(null);
      return undefined;
    }
    let cancelled = false;
    (async () => {
      const route = await fetchDrivingRoute(pickupPlace, dropoffPlace, {
        steps: false,
      });
      if (cancelled || !map.current) return;
      if (route?.geometry) {
        const feature = { type: 'Feature', geometry: route.geometry };
        if (map.current.getSource('trip-route')) {
          map.current.getSource('trip-route').setData(feature);
        } else {
          map.current.addSource('trip-route', {
            type: 'geojson',
            data: feature,
          });
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
      }
      const quote = await quoteTripFare(pickupPlace, dropoffPlace);
      if (!cancelled) {
        setFareQuote(
          quote
            ? { ...quote, etaMinutes: quote.etaMinutes ?? route?.etaMinutes }
            : null,
        );
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [mapReady, pickupPlace, dropoffPlace]);

  const swapPickupAndDestination = () => {
    const swapped = swapPlaces(pickupPlace, dropoffPlace);
    setPickupPlace(swapped.pickupPlace);
    setDropoffPlace(swapped.dropoffPlace);
    setPickupMode(dropoffMode);
    setDropoffMode(pickupMode);
    setCustomPickup(customDropoff);
    setCustomDropoff(customPickup);
    setActiveField((field) => (field === 'pickup' ? 'dropoff' : 'pickup'));
    setError('');
  };

  const confirm = async () => {
    setError('');
    setLoading(true);
    try {
      let from = pickupPlace;
      let to = dropoffPlace;

      if (!from) {
        from = await resolvePlace({
          mode: pickupMode === 'custom' ? 'custom' : pickupMode,
          ...placeArgs,
          customLabel: customPickup || pickupPlace?.label || homeAddress,
          customCoords: pickupPlace,
        });
      }
      if (!to) {
        to = await resolvePlace({
          mode: dropoffMode === 'custom' ? 'custom' : dropoffMode,
          ...placeArgs,
          customLabel: customDropoff || dropoffPlace?.label || school || 'School',
          customCoords: dropoffPlace,
        });
      }

      // Capture parent GPS so the driver receives it when the ride is booked
      const parentLocation = await captureParentLocationForBooking();

      setBookingDraft({
        pickup: from.label,
        dropoff: to.label,
        pickupCoords: { lng: from.lng, lat: from.lat },
        dropoffCoords: { lng: to.lng, lat: to.lat },
        pickupMode,
        dropoffMode,
        tripType: tripTypeFromModes(pickupMode, dropoffMode),
        customPickup: customPickup || from.label,
        customDropoff: customDropoff || to.label,
        school: childSchool.schoolName || school,
        schoolAddress: school,
        schoolCoords,
        distanceKm: fareQuote?.distanceKm ?? null,
        fareCents: fareQuote?.fareCents ?? null,
        parentLocation: parentLocation || null,
      });
      navigate('/schedule');
    } catch (err) {
      setError(
        err?.message?.includes('denied') || err?.code === 1
          ? 'Location permission denied. Allow location access or choose Home.'
          : err.message || 'Could not resolve locations',
      );
    } finally {
      setLoading(false);
    }
  };

  const useMyLocation = async () => {
    setError('');
    try {
      const pos = await getCurrentPosition();
      map.current?.easeTo({
        center: [pos.lng, pos.lat],
        zoom: 15,
        duration: 500,
      });
      setPickupMode('current');
    } catch (err) {
      setError(err.message || 'Could not get current location');
    }
  };

  const summary = (
    <div className="min-w-0">
      <p className="truncate text-sm font-bold text-slate-900">Pick locations</p>
      <p className="truncate text-xs text-slate-500">
        {pickupPlace?.label?.split('·')[0]?.trim() || 'Pickup'} →{' '}
        {dropoffPlace?.label?.split('·')[0]?.trim() || 'Drop-off'}
      </p>
    </div>
  );

  return (
    <div className="map-fullscreen map-geocoder-host">
      <div ref={mapContainer} className="absolute inset-0 h-full w-full" />

      {!mapReady && !mapError && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-slate-100/80">
          <p className="rounded-full bg-white px-4 py-2 text-sm font-medium text-slate-600 shadow">
            Loading map…
          </p>
        </div>
      )}

      {mapError && (
        <div className="absolute inset-x-4 top-24 z-30 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 shadow">
          <p className="font-semibold">Map unavailable</p>
          <p className="mt-1">{mapError}</p>
          <p className="mt-2 text-xs">
            You can still use the form below once the drawer is open, or set VITE_MAPBOX_TOKEN.
          </p>
        </div>
      )}

      {/* Top chrome */}
      <div className="pointer-events-none absolute left-0 right-0 top-0 z-30 flex items-start justify-between gap-2 p-3">
        <Link
          to="/select-children"
          className="pointer-events-auto flex h-11 w-11 items-center justify-center rounded-full bg-white text-lg font-semibold text-slate-800 shadow"
        >
          ←
        </Link>
        <div className="pointer-events-auto flex gap-2">
          <button
            type="button"
            onClick={useMyLocation}
            className="flex h-11 items-center gap-1.5 rounded-full bg-white px-3 text-xs font-semibold text-slate-700 shadow"
          >
            <Navigation size={14} className="text-blue-600" /> My GPS
          </button>
          <button
            type="button"
            onClick={() => setDrawerOpen((o) => !o)}
            className="flex h-11 items-center rounded-full bg-emerald-600 px-3 text-xs font-semibold text-white shadow"
          >
            {drawerOpen ? 'Hide details' : 'Details'}
          </button>
        </div>
      </div>

      {/* Active field chip */}
      <div className="absolute left-3 right-3 top-[4.75rem] z-20 flex justify-end gap-2 sm:left-auto">
        <div className="flex rounded-full bg-white/95 p-1 shadow backdrop-blur">
          <button
            type="button"
            onClick={() => setActiveField('pickup')}
            className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
              activeField === 'pickup'
                ? 'bg-emerald-600 text-white'
                : 'text-slate-600'
            }`}
          >
            Set pickup
          </button>
          <button
            type="button"
            onClick={() => setActiveField('dropoff')}
            className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
              activeField === 'dropoff'
                ? 'bg-sky-600 text-white'
                : 'text-slate-600'
            }`}
          >
            Set drop-off
          </button>
        </div>
      </div>

      <MapBottomDrawer
        open={drawerOpen}
        onToggle={() => setDrawerOpen((o) => !o)}
        summary={summary}
        maxHeight="62vh"
      >
        <p className="mb-4 text-sm text-slate-600">
          Search with the map bar, tap the map, or use presets. Active pin:{' '}
          <span className="font-semibold text-slate-900">
            {activeField === 'pickup' ? 'Pickup' : 'Drop-off'}
          </span>
          .
        </p>

        {/* Pickup */}
        <div>
          <label className="mb-2 flex items-center justify-between gap-2 text-sm font-semibold text-slate-800">
            <span className="inline-flex items-center gap-2">
              <MapPin size={16} className="text-emerald-600" /> Pickup for driver
            </span>
            <span className="text-[11px] font-medium text-slate-500">
              {tripTypeHint(tripTypeFromModes(pickupMode, dropoffMode))}
            </span>
          </label>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => {
                setActiveField('pickup');
                setPickupMode('home');
              }}
              className={`flex flex-col items-start gap-1 rounded-2xl border px-3 py-3 text-left transition ${
                pickupMode === 'home'
                  ? 'border-emerald-500 bg-emerald-50 ring-2 ring-emerald-500/20'
                  : 'border-slate-200 bg-white hover:border-emerald-300'
              }`}
            >
              <Home size={18} className="text-emerald-600" />
              <span className="text-sm font-semibold text-slate-900">Home</span>
              <span className="line-clamp-2 text-[11px] text-slate-500">{homeAddress}</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setActiveField('pickup');
                setPickupMode('current');
              }}
              className={`flex flex-col items-start gap-1 rounded-2xl border px-3 py-3 text-left transition ${
                pickupMode === 'current'
                  ? 'border-emerald-500 bg-emerald-50 ring-2 ring-emerald-500/20'
                  : 'border-slate-200 bg-white hover:border-emerald-300'
              }`}
            >
              <Navigation size={18} className="text-blue-600" />
              <span className="text-sm font-semibold text-slate-900">Current location</span>
              <span className="text-[11px] text-slate-500">Use phone GPS</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setActiveField('pickup');
                setPickupMode('school');
              }}
              className={`flex flex-col items-start gap-1 rounded-2xl border px-3 py-3 text-left transition ${
                pickupMode === 'school'
                  ? 'border-emerald-500 bg-emerald-50 ring-2 ring-emerald-500/20'
                  : 'border-slate-200 bg-white hover:border-emerald-300'
              }`}
            >
              <School size={18} className="text-emerald-700" />
              <span className="text-sm font-semibold text-slate-900">School</span>
              <span className="line-clamp-2 text-[11px] text-slate-500">
                {school ||
                  (selectedChild
                    ? `No school for ${selectedChild.name}`
                    : 'Add a school on the child profile')}
              </span>
            </button>
            <button
              type="button"
              onClick={() => {
                setActiveField('pickup');
                setPickupMode('custom');
              }}
              className={`flex flex-col items-start gap-1 rounded-2xl border px-3 py-3 text-left transition ${
                pickupMode === 'custom'
                  ? 'border-emerald-500 bg-emerald-50 ring-2 ring-emerald-500/20'
                  : 'border-slate-200 bg-white hover:border-emerald-300'
              }`}
            >
              <Map size={18} className="text-slate-600" />
              <span className="text-sm font-semibold text-slate-900">Search / pin</span>
              <span className="text-[11px] text-slate-500">Map or address book</span>
            </button>
          </div>
          {pickupMode === 'custom' && (
            <div className="mt-3">
              <AddressSearchInput
                value={customPickup}
                onChange={(v) => {
                  setCustomPickup(v);
                  setActiveField('pickup');
                }}
                onSelect={({ label, lng, lat }) => {
                  setPickupMode('custom');
                  setActiveField('pickup');
                  setCustomPickup(label);
                  setPickupPlace({ label, lng, lat });
                  map.current?.easeTo({
                    center: [lng, lat],
                    zoom: 14,
                    duration: 500,
                  });
                }}
                placeholder="Search pickup address…"
              />
            </div>
          )}
          {pickupPlace && (
            <p className="mt-2 truncate rounded-xl bg-emerald-50 px-3 py-2 text-xs text-emerald-900">
              ✓ {pickupPlace.label}
            </p>
          )}
        </div>

        <div className="mt-4 flex justify-center">
          <button
            type="button"
            onClick={swapPickupAndDestination}
            aria-label="Swap pickup and destination"
            className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 shadow-sm transition hover:border-emerald-400 hover:bg-emerald-50 hover:text-emerald-800"
          >
            <ArrowUpDown size={14} /> Swap pickup & destination
          </button>
        </div>

        {/* Destination */}
        <div className="mt-4">
          <label className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-800">
            <MapPin size={16} className="text-blue-600" /> Destination
          </label>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => {
                setActiveField('dropoff');
                setDropoffMode('school');
              }}
              className={`flex flex-col items-start gap-1 rounded-2xl border px-3 py-3 text-left transition ${
                dropoffMode === 'school'
                  ? 'border-blue-500 bg-blue-50 ring-2 ring-blue-500/20'
                  : 'border-slate-200 bg-white hover:border-blue-300'
              }`}
            >
              <School size={18} className="text-blue-600" />
              <span className="text-sm font-semibold text-slate-900">School</span>
              <span className="line-clamp-2 text-[11px] text-slate-500">
                {school ||
                  (selectedChild
                    ? `No school for ${selectedChild.name}`
                    : 'Add a school on the child profile')}
              </span>
            </button>
            <button
              type="button"
              onClick={() => {
                setActiveField('dropoff');
                setDropoffMode('home');
              }}
              className={`flex flex-col items-start gap-1 rounded-2xl border px-3 py-3 text-left transition ${
                dropoffMode === 'home'
                  ? 'border-blue-500 bg-blue-50 ring-2 ring-blue-500/20'
                  : 'border-slate-200 bg-white hover:border-blue-300'
              }`}
            >
              <Home size={18} className="text-blue-600" />
              <span className="text-sm font-semibold text-slate-900">Home</span>
              <span className="line-clamp-2 text-[11px] text-slate-500">{homeAddress}</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setActiveField('dropoff');
                setDropoffMode('custom');
              }}
              className={`col-span-2 flex flex-col items-start gap-1 rounded-2xl border px-3 py-3 text-left transition ${
                dropoffMode === 'custom'
                  ? 'border-blue-500 bg-blue-50 ring-2 ring-blue-500/20'
                  : 'border-slate-200 bg-white hover:border-blue-300'
              }`}
            >
              <Map size={18} className="text-slate-600" />
              <span className="text-sm font-semibold text-slate-900">Desired location</span>
              <span className="text-[11px] text-slate-500">Search address book</span>
            </button>
            {dropoffMode === 'current' && (
              <button
                type="button"
                onClick={() => {
                  setActiveField('dropoff');
                  setDropoffMode('current');
                }}
                className="col-span-2 flex flex-col items-start gap-1 rounded-2xl border border-blue-500 bg-blue-50 px-3 py-3 text-left ring-2 ring-blue-500/20"
              >
                <Navigation size={18} className="text-blue-600" />
                <span className="text-sm font-semibold text-slate-900">Current location</span>
                <span className="text-[11px] text-slate-500">Drop off at your GPS</span>
              </button>
            )}
          </div>

          {dropoffMode === 'custom' && (
            <div className="mt-3">
              <AddressSearchInput
                value={customDropoff}
                onChange={(v) => {
                  setCustomDropoff(v);
                  setActiveField('dropoff');
                }}
                onSelect={({ label, lng, lat }) => {
                  setDropoffMode('custom');
                  setActiveField('dropoff');
                  setCustomDropoff(label);
                  setDropoffPlace({ label, lng, lat });
                  map.current?.easeTo({
                    center: [lng, lat],
                    zoom: 14,
                    duration: 500,
                  });
                }}
                placeholder="Filter destinations from address book…"
              />
            </div>
          )}

          {dropoffPlace && (
            <p className="mt-2 truncate rounded-xl bg-sky-50 px-3 py-2 text-xs text-sky-900">
              ✓ {dropoffPlace.label}
            </p>
          )}
          {(pickupMode === 'school' || dropoffMode === 'school') &&
            selectedChild &&
            !childHasSchool(selectedChild) && (
              <p className="mt-2 text-xs text-amber-800">
                Add a school address on{' '}
                <Link
                  to={`/add-child?id=${selectedChild.id}`}
                  className="font-semibold underline"
                >
                  {selectedChild.name}&apos;s profile
                </Link>{' '}
                to use school as pickup or destination.
              </p>
            )}
        </div>

        {fareQuote && pickupPlace && dropoffPlace && (
          <div className="mt-4 flex items-center justify-between rounded-2xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm">
            <span className="text-emerald-800">
              {formatDistanceKm(fareQuote.distanceKm) || '—'}
              {fareQuote.etaMinutes != null
                ? ` · ${formatEtaMinutes(fareQuote.etaMinutes)}`
                : ''}
            </span>
            <span className="font-bold text-emerald-900">
              {formatMoney(fareQuote.fareCents)}
            </span>
          </div>
        )}

        {error && (
          <p className="mt-4 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
        )}

        <button
          type="button"
          disabled={
            loading ||
            !pickupPlace ||
            !dropoffPlace ||
            ((pickupMode === 'school' || dropoffMode === 'school') &&
              selectedChild &&
              !childHasSchool(selectedChild)) ||
            (pickupMode === 'custom' && !pickupPlace) ||
            (dropoffMode === 'custom' && !dropoffPlace)
          }
          onClick={confirm}
          className="mt-6 w-full rounded-2xl bg-emerald-600 py-4 font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading
            ? 'Saving locations…'
            : fareQuote
              ? `Confirm · ${formatMoney(fareQuote.fareCents)}`
              : 'Confirm locations'}
        </button>
      </MapBottomDrawer>
    </div>
  );
}
