/**
 * Dynamic school-run fare from trip distance + local fuel cost (NGN).
 *
 * Env overrides:
 *   FUEL_PRICE_NGN          — pump price per litre (default ~1100)
 *   FUEL_EFFICIENCY_KM_L    — vehicle km per litre (default 10)
 *   BASE_FARE_NGN           — flag-fall / base (default 800)
 *   LABOR_PER_KM_NGN        — driver time/wear per km (default 150)
 *   MIN_FARE_NGN / MAX_FARE_NGN
 */

const DEFAULTS = {
  fuelPricePerLiter: Number(process.env.FUEL_PRICE_NGN) || 1100,
  fuelEfficiencyKmPerL: Number(process.env.FUEL_EFFICIENCY_KM_L) || 10,
  baseFareNaira: Number(process.env.BASE_FARE_NGN) || 800,
  laborPerKmNaira: Number(process.env.LABOR_PER_KM_NGN) || 150,
  minFareNaira: Number(process.env.MIN_FARE_NGN) || 1000,
  maxFareNaira: Number(process.env.MAX_FARE_NGN) || 25000,
  /** Minimum billed distance so very short hops still pay fairly */
  minDistanceKm: 1.5,
};

/** Great-circle distance in km between two {lng,lat} points */
export function haversineKm(a, b) {
  if (
    a?.lng == null ||
    a?.lat == null ||
    b?.lng == null ||
    b?.lat == null
  ) {
    return null;
  }
  const toRad = (d) => (d * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

/**
 * Resolve billed road/straight-line distance.
 * Prefers client-reported route km when finite; else haversine; else min distance.
 */
export function resolveDistanceKm({
  pickupCoords,
  dropoffCoords,
  distanceKm,
} = {}) {
  const reported = Number(distanceKm);
  if (Number.isFinite(reported) && reported > 0) {
    return Math.max(reported, DEFAULTS.minDistanceKm);
  }
  const straight = haversineKm(pickupCoords, dropoffCoords);
  if (straight != null && Number.isFinite(straight)) {
    // Road distance is typically ~1.25× straight line in dense cities
    const roadEstimate = straight * 1.25;
    return Math.max(roadEstimate, DEFAULTS.minDistanceKm);
  }
  return DEFAULTS.minDistanceKm;
}

/**
 * Compute fare in kobo (cents) for NGN.
 * @returns {{
 *   fareCents: number,
 *   distanceKm: number,
 *   fuelPricePerLiter: number,
 *   fuelLiters: number,
 *   fuelCostNaira: number,
 *   laborNaira: number,
 *   baseFareNaira: number,
 *   totalNaira: number,
 *   currency: 'ngn',
 *   breakdown: object
 * }}
 */
export function calculateFare(input = {}) {
  const fuelPricePerLiter =
    Number(input.fuelPricePerLiter) > 0
      ? Number(input.fuelPricePerLiter)
      : DEFAULTS.fuelPricePerLiter;
  const efficiency =
    Number(input.fuelEfficiencyKmPerL) > 0
      ? Number(input.fuelEfficiencyKmPerL)
      : DEFAULTS.fuelEfficiencyKmPerL;
  const baseFareNaira = DEFAULTS.baseFareNaira;
  const laborPerKm = DEFAULTS.laborPerKmNaira;

  const distanceKm = resolveDistanceKm(input);
  const fuelLiters = distanceKm / efficiency;
  const fuelCostNaira = fuelLiters * fuelPricePerLiter;
  const laborNaira = distanceKm * laborPerKm;
  let totalNaira = Math.round(baseFareNaira + fuelCostNaira + laborNaira);
  totalNaira = Math.max(
    DEFAULTS.minFareNaira,
    Math.min(DEFAULTS.maxFareNaira, totalNaira),
  );

  const fareCents = Math.round(totalNaira * 100);

  const breakdown = {
    distanceKm: Math.round(distanceKm * 100) / 100,
    fuelPricePerLiter,
    fuelEfficiencyKmPerL: efficiency,
    fuelLiters: Math.round(fuelLiters * 1000) / 1000,
    fuelCostNaira: Math.round(fuelCostNaira),
    laborNaira: Math.round(laborNaira),
    baseFareNaira,
    totalNaira,
  };

  return {
    fareCents,
    distanceKm: breakdown.distanceKm,
    fuelPricePerLiter,
    fuelLiters: breakdown.fuelLiters,
    fuelCostNaira: breakdown.fuelCostNaira,
    laborNaira: breakdown.laborNaira,
    baseFareNaira,
    totalNaira,
    currency: 'ngn',
    breakdown,
  };
}

export function pricingDefaults() {
  return { ...DEFAULTS };
}

/**
 * Pick nearest available driver to a point from a list of driver docs/lean objects.
 * Drivers without lastLocation are ranked last (Infinity distance).
 */
export function pickNearestDriver(drivers, targetCoords) {
  if (!Array.isArray(drivers) || !drivers.length) return null;
  if (targetCoords?.lng == null || targetCoords?.lat == null) {
    return drivers[0] || null;
  }

  let best = null;
  let bestKm = Infinity;

  for (const d of drivers) {
    const loc = d.lastLocation || d.location;
    const km = haversineKm(loc, targetCoords);
    const dist = km == null ? Infinity : km;
    if (dist < bestKm) {
      bestKm = dist;
      best = d;
    }
  }

  if (!best) return drivers[0] || null;
  return {
    driver: best,
    distanceKm: Number.isFinite(bestKm) ? Math.round(bestKm * 100) / 100 : null,
  };
}
