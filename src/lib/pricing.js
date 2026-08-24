/**
 * Client-side fare preview (mirrors server/utils/pricing.js).
 * Server always recomputes and is authoritative at booking time.
 */

import { haversineKm, fetchDrivingRoute } from './geo.js';

const DEFAULTS = {
  fuelPricePerLiter: Number(import.meta.env.VITE_FUEL_PRICE_NGN) || 1100,
  fuelEfficiencyKmPerL: Number(import.meta.env.VITE_FUEL_EFFICIENCY_KM_L) || 10,
  baseFareNaira: Number(import.meta.env.VITE_BASE_FARE_NGN) || 800,
  laborPerKmNaira: Number(import.meta.env.VITE_LABOR_PER_KM_NGN) || 150,
  minFareNaira: 1000,
  maxFareNaira: 25000,
  minDistanceKm: 1.5,
};

export function calculateFarePreview({
  distanceKm,
  pickupCoords,
  dropoffCoords,
  fuelPricePerLiter = DEFAULTS.fuelPricePerLiter,
} = {}) {
  let km = Number(distanceKm);
  if (!Number.isFinite(km) || km <= 0) {
    const straight = haversineKm(pickupCoords, dropoffCoords);
    km =
      straight != null
        ? Math.max(straight * 1.25, DEFAULTS.minDistanceKm)
        : DEFAULTS.minDistanceKm;
  } else {
    km = Math.max(km, DEFAULTS.minDistanceKm);
  }

  const efficiency = DEFAULTS.fuelEfficiencyKmPerL;
  const fuelLiters = km / efficiency;
  const fuelCostNaira = fuelLiters * fuelPricePerLiter;
  const laborNaira = km * DEFAULTS.laborPerKmNaira;
  let totalNaira = Math.round(
    DEFAULTS.baseFareNaira + fuelCostNaira + laborNaira,
  );
  totalNaira = Math.max(
    DEFAULTS.minFareNaira,
    Math.min(DEFAULTS.maxFareNaira, totalNaira),
  );

  return {
    fareCents: totalNaira * 100,
    distanceKm: Math.round(km * 100) / 100,
    fuelPricePerLiter,
    fuelLiters: Math.round(fuelLiters * 1000) / 1000,
    fuelCostNaira: Math.round(fuelCostNaira),
    laborNaira: Math.round(laborNaira),
    baseFareNaira: DEFAULTS.baseFareNaira,
    totalNaira,
    currency: 'ngn',
    breakdown: {
      distanceKm: Math.round(km * 100) / 100,
      fuelPricePerLiter,
      fuelCostNaira: Math.round(fuelCostNaira),
      laborNaira: Math.round(laborNaira),
      baseFareNaira: DEFAULTS.baseFareNaira,
      totalNaira,
    },
  };
}

/** Prefer Mapbox road distance when available for a better quote. */
export async function quoteTripFare(pickupCoords, dropoffCoords) {
  if (!pickupCoords || !dropoffCoords) {
    return calculateFarePreview({ pickupCoords, dropoffCoords });
  }
  try {
    const route = await fetchDrivingRoute(pickupCoords, dropoffCoords, {
      steps: false,
    });
    if (route?.distanceKm != null) {
      return {
        ...calculateFarePreview({
          distanceKm: route.distanceKm,
          pickupCoords,
          dropoffCoords,
        }),
        etaMinutes: route.etaMinutes ?? null,
      };
    }
  } catch {
    /* fall through */
  }
  return calculateFarePreview({ pickupCoords, dropoffCoords });
}

export { haversineKm };
