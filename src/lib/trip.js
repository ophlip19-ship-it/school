/**
 * School-run trip direction.
 *
 *  - dropoff  = to school   (home → school)  morning
 *  - pickup   = from school (school → home)  afternoon
 */

import {
  hasLngLat,
  schoolCoordsFromChild,
  schoolLabelFromChild,
} from './geo';

export const TRIP_TO_SCHOOL = 'dropoff';
export const TRIP_FROM_SCHOOL = 'pickup';

export function tripTypeLabel(tripType) {
  return tripType === TRIP_FROM_SCHOOL ? 'School pickup' : 'School dropoff';
}

export function tripTypeHint(tripType) {
  return tripType === TRIP_FROM_SCHOOL
    ? 'School → Home'
    : 'Home → School';
}

export function isFromSchool(tripType) {
  return tripType === TRIP_FROM_SCHOOL;
}

/** Morning → school, afternoon → collect from school. */
export function defaultTripType(date = new Date()) {
  const hour = date.getHours();
  return hour < 12 ? TRIP_TO_SCHOOL : TRIP_FROM_SCHOOL;
}

export function defaultTimeForTripType(tripType) {
  return isFromSchool(tripType) ? '14:30' : '07:30';
}

export function modesForTripType(tripType) {
  if (isFromSchool(tripType)) {
    return { pickupMode: 'school', dropoffMode: 'home' };
  }
  return { pickupMode: 'home', dropoffMode: 'school' };
}

export function tripTypeFromModes(pickupMode, dropoffMode) {
  if (pickupMode === 'school' || dropoffMode === 'home') {
    return TRIP_FROM_SCHOOL;
  }
  return TRIP_TO_SCHOOL;
}

export function homePlaceFromUser(user) {
  const label = String(user?.homeAddress || '').trim();
  if (hasLngLat(user?.homeCoords)) {
    return {
      label: label || 'Home',
      lng: Number(user.homeCoords.lng),
      lat: Number(user.homeCoords.lat),
      kind: 'home',
    };
  }
  if (label) {
    return { label, lng: null, lat: null, kind: 'home' };
  }
  return null;
}

export function schoolPlaceFromChild(child) {
  if (!child) return null;
  const label = schoolLabelFromChild(child);
  const coords = schoolCoordsFromChild(child);
  if (coords) {
    return {
      label: label || child.school || 'School',
      lng: coords.lng,
      lat: coords.lat,
      kind: 'school',
    };
  }
  if (label) {
    return { label, lng: null, lat: null, kind: 'school' };
  }
  return null;
}

export function swapPlaces(pickupPlace, dropoffPlace) {
  return {
    pickupPlace: dropoffPlace || null,
    dropoffPlace: pickupPlace || null,
  };
}
