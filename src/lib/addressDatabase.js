/**
 * Local map address database for destination / pickup search filtering.
 * Biased toward Lagos school-run corridors. Results are ranked by query match.
 * Mapbox forward geocoding can still be used as a remote fallback.
 */

import { forwardGeocode, DEFAULT_HOME, DEFAULT_SCHOOL } from './geo';

/** @typedef {{ id: string, label: string, name: string, area: string, type: 'school'|'home'|'landmark'|'hospital'|'mall'|'estate'|'transport', lng: number, lat: number, aliases?: string[] }} AddressEntry */

/** @type {AddressEntry[]} */
export const ADDRESS_DATABASE = [
  // Schools
  {
    id: 'sch-greenfield',
    name: 'Greenfield School',
    label: 'Greenfield School · Victoria Island',
    area: 'Victoria Island',
    type: 'school',
    lng: 3.4219,
    lat: 6.4281,
    aliases: ['greenfield', 'vi school'],
  },
  {
    id: 'sch-grange',
    name: 'Grange School',
    label: 'Grange School · Ikeja GRA',
    area: 'Ikeja GRA',
    type: 'school',
    lng: 3.3515,
    lat: 6.5721,
    aliases: ['grange'],
  },
  {
    id: 'sch-chrisland',
    name: 'Chrisland Schools',
    label: 'Chrisland Schools · Ikeja',
    area: 'Ikeja',
    type: 'school',
    lng: 3.3512,
    lat: 6.6018,
    aliases: ['chrisland'],
  },
  {
    id: 'sch-atlantic',
    name: 'Atlantic Hall',
    label: 'Atlantic Hall · Poka Epe',
    area: 'Epe',
    type: 'school',
    lng: 3.9834,
    lat: 6.6051,
    aliases: ['atlantic hall'],
  },
  {
    id: 'sch-daywaterman',
    name: 'Day Waterman College',
    label: 'Day Waterman College · Abeokuta Road',
    area: 'Ogun',
    type: 'school',
    lng: 3.3751,
    lat: 6.9012,
    aliases: ['day waterman', 'dwc'],
  },
  {
    id: 'sch-corona',
    name: 'Corona School',
    label: 'Corona School · Gbagada',
    area: 'Gbagada',
    type: 'school',
    lng: 3.3891,
    lat: 6.5512,
    aliases: ['corona'],
  },
  {
    id: 'sch-whitesands',
    name: 'Whitesands School',
    label: 'Whitesands School · Lekki',
    area: 'Lekki',
    type: 'school',
    lng: 3.5241,
    lat: 6.4478,
    aliases: ['whitesands'],
  },
  {
    id: 'sch-lekkibritish',
    name: 'Lekki British School',
    label: 'Lekki British School · Lekki Phase 1',
    area: 'Lekki Phase 1',
    type: 'school',
    lng: 3.4712,
    lat: 6.4489,
    aliases: ['lekki british', 'lbs'],
  },
  {
    id: 'sch-american',
    name: 'American International School of Lagos',
    label: 'American International School · Victoria Island',
    area: 'Victoria Island',
    type: 'school',
    lng: 3.4301,
    lat: 6.4355,
    aliases: ['aisl', 'american school'],
  },
  {
    id: 'sch-british',
    name: 'British International School',
    label: 'British International School · Victoria Island',
    area: 'Victoria Island',
    type: 'school',
    lng: 3.4245,
    lat: 6.4312,
    aliases: ['bis lagos', 'british school'],
  },

  // Residential / estates
  {
    id: 'home-admiralty',
    name: '12 Admiralty Way',
    label: '12 Admiralty Way, Lekki Phase 1',
    area: 'Lekki Phase 1',
    type: 'home',
    lng: DEFAULT_HOME.lng,
    lat: DEFAULT_HOME.lat,
    aliases: ['admiralty', 'lekki home'],
  },
  {
    id: 'est-chevron',
    name: 'Chevron Drive',
    label: 'Chevron Drive, Lekki',
    area: 'Lekki',
    type: 'estate',
    lng: 3.5124,
    lat: 6.4398,
    aliases: ['chevron'],
  },
  {
    id: 'est-ikate',
    name: 'Ikate Elegushi',
    label: 'Ikate Elegushi, Lekki',
    area: 'Lekki',
    type: 'estate',
    lng: 3.4881,
    lat: 6.4412,
    aliases: ['ikate'],
  },
  {
    id: 'est-osapa',
    name: 'Osapa London',
    label: 'Osapa London, Lekki',
    area: 'Lekki',
    type: 'estate',
    lng: 3.5012,
    lat: 6.4355,
    aliases: ['osapa'],
  },
  {
    id: 'est-agungi',
    name: 'Agungi',
    label: 'Agungi, Lekki',
    area: 'Lekki',
    type: 'estate',
    lng: 3.4921,
    lat: 6.4491,
    aliases: ['agungi'],
  },
  {
    id: 'est-banana',
    name: 'Banana Island',
    label: 'Banana Island, Ikoyi',
    area: 'Ikoyi',
    type: 'estate',
    lng: 3.4551,
    lat: 6.4662,
    aliases: ['banana island'],
  },
  {
    id: 'est-parkview',
    name: 'Parkview Estate',
    label: 'Parkview Estate, Ikoyi',
    area: 'Ikoyi',
    type: 'estate',
    lng: 3.4412,
    lat: 6.4589,
    aliases: ['parkview'],
  },
  {
    id: 'est-magodo',
    name: 'Magodo Phase 2',
    label: 'Magodo GRA Phase 2, Lagos',
    area: 'Magodo',
    type: 'estate',
    lng: 3.3841,
    lat: 6.6342,
    aliases: ['magodo'],
  },
  {
    id: 'est-gbagada',
    name: 'Gbagada Phase 1',
    label: 'Gbagada Phase 1, Lagos',
    area: 'Gbagada',
    type: 'estate',
    lng: 3.3912,
    lat: 6.5489,
    aliases: ['gbagada'],
  },
  {
    id: 'est-yaba',
    name: 'Yaba',
    label: 'Yaba, Lagos',
    area: 'Yaba',
    type: 'estate',
    lng: 3.3791,
    lat: 6.5091,
    aliases: ['yaba'],
  },
  {
    id: 'est-surulere',
    name: 'Surulere',
    label: 'Surulere, Lagos',
    area: 'Surulere',
    type: 'estate',
    lng: 3.3541,
    lat: 6.4962,
    aliases: ['surulere'],
  },
  {
    id: 'est-ajah',
    name: 'Ajah',
    label: 'Ajah, Lagos',
    area: 'Ajah',
    type: 'estate',
    lng: 3.5681,
    lat: 6.4672,
    aliases: ['ajah'],
  },
  {
    id: 'est-sangotedo',
    name: 'Sangotedo',
    label: 'Sangotedo, Lekki-Epe Expressway',
    area: 'Sangotedo',
    type: 'estate',
    lng: 3.6012,
    lat: 6.4589,
    aliases: ['sangotedo'],
  },
  {
    id: 'est-victoria-garden',
    name: 'Victoria Garden City',
    label: 'Victoria Garden City (VGC), Lekki',
    area: 'VGC',
    type: 'estate',
    lng: 3.5412,
    lat: 6.4391,
    aliases: ['vgc', 'victoria garden'],
  },
  {
    id: 'est-ikeja-gra',
    name: 'Ikeja GRA',
    label: 'Ikeja GRA, Lagos',
    area: 'Ikeja',
    type: 'estate',
    lng: 3.3489,
    lat: 6.5781,
    aliases: ['ikeja gra'],
  },

  // Landmarks / malls
  {
    id: 'mall-palms',
    name: 'The Palms Shopping Mall',
    label: 'The Palms Shopping Mall, Lekki',
    area: 'Lekki',
    type: 'mall',
    lng: 3.4718,
    lat: 6.4352,
    aliases: ['palms mall', 'shoprite lekki'],
  },
  {
    id: 'mall-ikeja-city',
    name: 'Ikeja City Mall',
    label: 'Ikeja City Mall, Alausa',
    area: 'Ikeja',
    type: 'mall',
    lng: 3.3591,
    lat: 6.6189,
    aliases: ['ikeja city mall', 'icm'],
  },
  {
    id: 'lm-landmark',
    name: 'Landmark Beach',
    label: 'Landmark Beach Resort, Oniru',
    area: 'Victoria Island',
    type: 'landmark',
    lng: 3.4412,
    lat: 6.4211,
    aliases: ['landmark'],
  },
  {
    id: 'lm-national-theatre',
    name: 'National Theatre',
    label: 'National Theatre, Iganmu',
    area: 'Iganmu',
    type: 'landmark',
    lng: 3.3691,
    lat: 6.4742,
    aliases: ['national theatre'],
  },
  {
    id: 'lm-tbs',
    name: 'Tafawa Balewa Square',
    label: 'Tafawa Balewa Square (TBS), Lagos Island',
    area: 'Lagos Island',
    type: 'landmark',
    lng: 3.3962,
    lat: 6.4461,
    aliases: ['tbs'],
  },
  {
    id: 'lm-eko-hotel',
    name: 'Eko Hotel',
    label: 'Eko Hotels & Suites, Victoria Island',
    area: 'Victoria Island',
    type: 'landmark',
    lng: 3.4289,
    lat: 6.4261,
    aliases: ['eko hotel'],
  },

  // Hospitals
  {
    id: 'hosp-lagoon',
    name: 'Lagoon Hospital',
    label: 'Lagoon Hospital, Apapa',
    area: 'Apapa',
    type: 'hospital',
    lng: 3.3612,
    lat: 6.4489,
    aliases: ['lagoon hospital'],
  },
  {
    id: 'hosp-redington',
    name: 'Reddington Hospital',
    label: 'Reddington Hospital, Victoria Island',
    area: 'Victoria Island',
    type: 'hospital',
    lng: 3.4251,
    lat: 6.4298,
    aliases: ['reddington'],
  },
  {
    id: 'hosp-lagoon-ikoyi',
    name: 'Lagoon Hospital Ikoyi',
    label: 'Lagoon Hospital, Ikoyi',
    area: 'Ikoyi',
    type: 'hospital',
    lng: 3.4389,
    lat: 6.4551,
    aliases: ['lagoon ikoyi'],
  },

  // Transport hubs
  {
    id: 'tr-murtala',
    name: 'Murtala Muhammed Airport',
    label: 'Murtala Muhammed International Airport (LOS)',
    area: 'Ikeja',
    type: 'transport',
    lng: 3.3211,
    lat: 6.5774,
    aliases: ['airport', 'mmia', 'los'],
  },
  {
    id: 'tr-cms',
    name: 'CMS Bus Terminal',
    label: 'CMS Bus Terminal, Lagos Island',
    area: 'Lagos Island',
    type: 'transport',
    lng: 3.3912,
    lat: 6.4512,
    aliases: ['cms'],
  },
  {
    id: 'tr-ojuelegba',
    name: 'Ojuelegba',
    label: 'Ojuelegba Junction, Surulere',
    area: 'Surulere',
    type: 'transport',
    lng: 3.3662,
    lat: 6.5089,
    aliases: ['ojuelegba'],
  },
  {
    id: 'sch-default',
    name: 'Default School Gate',
    label: DEFAULT_SCHOOL.label,
    area: 'Victoria Island',
    type: 'school',
    lng: DEFAULT_SCHOOL.lng,
    lat: DEFAULT_SCHOOL.lat,
    aliases: ['school gate', 'main gate'],
  },
];

function normalize(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function scoreEntry(entry, query) {
  const q = normalize(query);
  if (!q) return 0;
  const hay = normalize(
    [entry.name, entry.label, entry.area, ...(entry.aliases || [])].join(' '),
  );
  if (hay === q) return 100;
  if (hay.startsWith(q)) return 90;
  if (normalize(entry.name).startsWith(q)) return 85;
  if (hay.includes(` ${q}`) || hay.includes(q)) return 70;
  // token match
  const tokens = q.split(' ').filter(Boolean);
  let hit = 0;
  for (const t of tokens) {
    if (hay.includes(t)) hit += 1;
  }
  if (hit === 0) return 0;
  return 40 + (hit / tokens.length) * 30;
}

/**
 * Filter the local address database by free-text query.
 * @param {string} query
 * @param {{ limit?: number, types?: string[] }} [opts]
 * @returns {Array<AddressEntry & { score: number }>}
 */
export function filterAddressDatabase(query, opts = {}) {
  const limit = opts.limit ?? 8;
  const types = opts.types;
  const q = (query || '').trim();
  let list = ADDRESS_DATABASE;
  if (types?.length) {
    list = list.filter((e) => types.includes(e.type));
  }
  if (!q) {
    return list.slice(0, limit).map((e) => ({ ...e, score: 0 }));
  }
  return list
    .map((e) => ({ ...e, score: scoreEntry(e, q) }))
    .filter((e) => e.score > 0)
    .sort((a, b) => b.score - a.score || a.label.localeCompare(b.label))
    .slice(0, limit);
}

/**
 * Search destinations: local DB first, then Mapbox if thin results.
 * @param {string} query
 * @param {{ limit?: number, types?: string[], remote?: boolean }} [opts]
 */
export async function searchDestinations(query, opts = {}) {
  const limit = opts.limit ?? 8;
  const local = filterAddressDatabase(query, { limit, types: opts.types });
  const results = local.map((e) => ({
    id: e.id,
    label: e.label,
    name: e.name,
    area: e.area,
    type: e.type,
    lng: e.lng,
    lat: e.lat,
    source: 'local',
  }));

  const wantRemote = opts.remote !== false && (query || '').trim().length >= 3;
  if (wantRemote && results.length < 3) {
    try {
      const geo = await forwardGeocode(query);
      for (const r of geo?.results || []) {
        const dup = results.some(
          (x) =>
            Math.abs(x.lng - r.lng) < 0.0005 && Math.abs(x.lat - r.lat) < 0.0005,
        );
        if (dup) continue;
        results.push({
          id: `mapbox-${r.lng}-${r.lat}`,
          label: r.label,
          name: r.label.split(',')[0],
          area: '',
          type: 'landmark',
          lng: r.lng,
          lat: r.lat,
          source: 'mapbox',
        });
        if (results.length >= limit) break;
      }
    } catch {
      /* keep local only */
    }
  }

  return results.slice(0, limit);
}

/**
 * Find a school entry by name (for resolveDestination fallbacks).
 */
export function findSchoolInDatabase(schoolName) {
  if (!schoolName) return null;
  const hits = filterAddressDatabase(schoolName, {
    limit: 1,
    types: ['school'],
  });
  return hits[0] || null;
}
