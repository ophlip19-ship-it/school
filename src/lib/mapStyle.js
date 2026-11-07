import mapboxgl from 'mapbox-gl';
import { mapboxToken } from './geo';

/** Current Mapbox Standard style (3D basemap, config, featuresets). */
export const STANDARD_STYLE = 'mapbox://styles/mapbox/standard';

const CONGESTION_COLORS = {
  low: '#16a34a',
  moderate: '#ca8a04',
  heavy: '#ea580c',
  severe: '#dc2626',
};

/** Dawn / day / dusk / night from the viewer's local time. */
export function lightPresetForNow(date = new Date()) {
  const hour = date.getHours();
  if (hour >= 5 && hour < 8) return 'dawn';
  if (hour >= 8 && hour < 17) return 'day';
  if (hour >= 17 && hour < 20) return 'dusk';
  return 'night';
}

export function basemapConfig(options = {}) {
  const pitched = options.pitched === true;
  return {
    lightPreset: options.lightPreset || lightPresetForNow(),
    theme: 'default',
    font: 'Inter',
    show3dObjects: true,
    show3dBuildings: options.show3dBuildings !== false,
    show3dLandmarks: true,
    show3dFacades: pitched,
    show3dTrees: false,
    showHdRoads: options.showHdRoads === true,
    showPedestrianRoads: true,
    showRoadLabels: true,
    showPlaceLabels: true,
    showPointOfInterestLabels: options.showPointOfInterestLabels !== false,
    showTransitLabels: true,
    colorEducation: '#7c3aed',
    colorBuildingSelect: '#059669',
    colorBuildingHighlight: '#38bdf8',
  };
}

/**
 * Mapbox Standard map tuned for school runs.
 * HD lane geometry is on for navigation maps (GL JS 3.30+).
 */
export function createSchoolRunMap(container, options = {}) {
  const token = options.accessToken || mapboxToken();
  if (token) mapboxgl.accessToken = token;

  const pitch = options.pitch ?? 0;
  const pitched = pitch >= 20 || options.hdRoads === true;
  const map = new mapboxgl.Map({
    container,
    style: STANDARD_STYLE,
    center: options.center,
    zoom: options.zoom ?? 12,
    pitch,
    bearing: options.bearing ?? 0,
    antialias: true,
    config: {
      basemap: basemapConfig({
        pitched,
        showHdRoads: options.hdRoads === true,
        showPointOfInterestLabels: options.showPointOfInterestLabels,
      }),
    },
  });

  if (options.navigation !== false) {
    map.addControl(
      new mapboxgl.NavigationControl({
        showCompass: options.showCompass !== false,
        visualizePitch: pitched,
      }),
      options.navPosition || 'top-right',
    );
  }

  const syncLight = () => {
    try {
      const next = lightPresetForNow();
      const current =
        typeof map.getConfigProperty === 'function'
          ? map.getConfigProperty('basemap', 'lightPreset')
          : null;
      if (current !== next) {
        map.setConfigProperty('basemap', 'lightPreset', next);
      }
    } catch {
      /* style not ready */
    }
  };
  map.on('load', syncLight);
  const timer = window.setInterval(syncLight, 10 * 60 * 1000);
  map.once('remove', () => window.clearInterval(timer));
  return map;
}

/** Merge same-color segments so the route layer stays small. */
export function routeFeatureCollection(geometry, congestion, fallbackColor) {
  const coords = geometry?.coordinates;
  if (!Array.isArray(coords) || coords.length < 2) {
    return { type: 'FeatureCollection', features: [] };
  }
  const aligned =
    Array.isArray(congestion) && congestion.length === coords.length - 1;
  const features = [];
  for (let i = 0; i < coords.length - 1; i += 1) {
    const level = aligned ? congestion[i] : 'unknown';
    const color = CONGESTION_COLORS[level] || fallbackColor;
    const last = features[features.length - 1];
    if (last && last.properties.color === color) {
      last.geometry.coordinates.push(coords[i + 1]);
    } else {
      features.push({
        type: 'Feature',
        properties: { color, level: level || 'unknown' },
        geometry: {
          type: 'LineString',
          coordinates: [coords[i], coords[i + 1]],
        },
      });
    }
  }
  return { type: 'FeatureCollection', features };
}

function asCollection(input, fallbackColor) {
  if (!input) return null;
  if (input.type === 'FeatureCollection') return input;
  if (input.type === 'Feature' && input.geometry) {
    return {
      type: 'FeatureCollection',
      features: [
        {
          ...input,
          properties: {
            color: fallbackColor,
            ...(input.properties || {}),
          },
        },
      ],
    };
  }
  if (input.type === 'LineString') {
    return {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: { color: fallbackColor },
          geometry: input,
        },
      ],
    };
  }
  return null;
}

/**
 * Draw a line into the Standard style `middle` slot (above roads, under buildings).
 * Source id owns `${sourceId}-casing` and `${sourceId}-line`.
 */
export function drawLine(map, sourceId, geometryOrFeature, paint = {}) {
  if (!map || !sourceId) return;
  if (typeof map.isStyleLoaded === 'function' && !map.isStyleLoaded()) return;
  const color = paint['line-color'] || '#10b981';
  const width = paint['line-width'] ?? 4;
  const opacity = paint['line-opacity'] ?? 0.9;
  const dash = paint['line-dasharray'];
  const collection = asCollection(geometryOrFeature, color);
  if (!collection?.features?.length) return;

  const casingId = `${sourceId}-casing`;
  const lineId = `${sourceId}-line`;

  if (map.getSource(sourceId)) {
    map.getSource(sourceId).setData(collection);
    return;
  }

  map.addSource(sourceId, { type: 'geojson', data: collection });
  const layout = { 'line-cap': 'round', 'line-join': 'round' };
  if (!dash) {
    map.addLayer({
      id: casingId,
      type: 'line',
      source: sourceId,
      slot: 'middle',
      layout,
      paint: {
        'line-color': '#0f172a',
        'line-width': Number(width) + 3,
        'line-opacity': 0.28,
      },
    });
  }
  map.addLayer({
    id: lineId,
    type: 'line',
    source: sourceId,
    slot: 'middle',
    layout,
    paint: {
      'line-color': ['coalesce', ['get', 'color'], color],
      'line-width': width,
      'line-opacity': opacity,
      ...(dash ? { 'line-dasharray': dash } : {}),
    },
  });
}

/** Traffic-colored route. Set congestion: false for a single-color reference line. */
export function drawTrafficRoute(map, sourceId, route, options = {}) {
  if (!route?.geometry) return;
  const color = options.color || '#10b981';
  const collection = routeFeatureCollection(
    route.geometry,
    options.congestion === false ? null : route.congestion,
    color,
  );
  drawLine(map, sourceId, collection, {
    'line-color': color,
    'line-width': options.width ?? 5,
    'line-opacity': options.opacity ?? 0.9,
    ...(options.dash ? { 'line-dasharray': options.dash } : {}),
  });
}

export function removeDrawnLine(map, sourceId) {
  if (!map || !sourceId) return;
  for (const id of [`${sourceId}-line`, `${sourceId}-casing`]) {
    try {
      if (map.getLayer(id)) map.removeLayer(id);
    } catch {
      /* style swapping */
    }
  }
  try {
    if (map.getSource(sourceId)) map.removeSource(sourceId);
  } catch {
    /* style swapping */
  }
}

/**
 * Select the Standard-style building under a click so colorBuildingSelect shows.
 * Safe to call when the featureset query is unavailable.
 */
export function highlightBuilding(map, point, selectedRef) {
  if (!map || !point) return;
  let features = [];
  try {
    features =
      map.queryRenderedFeatures(point, {
        target: { featuresetId: 'buildings', importId: 'basemap' },
      }) || [];
  } catch {
    return;
  }
  const next = features[0];
  if (selectedRef?.current) {
    try {
      map.setFeatureState(selectedRef.current, { select: false });
    } catch {
      /* previous feature expired with the tiles */
    }
  }
  if (!next) {
    if (selectedRef) selectedRef.current = null;
    return;
  }
  try {
    map.setFeatureState(next, { select: true });
    if (selectedRef) selectedRef.current = next;
  } catch {
    if (selectedRef) selectedRef.current = null;
  }
}
