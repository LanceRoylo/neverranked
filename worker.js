/**
 * neverranked.com edge worker.
 *
 * The site is otherwise pure static assets. This worker exists for ONE reason:
 * a tiny per-visitor /geo endpoint that returns the viewer's NEAREST LARGE CITY
 * from Cloudflare's own request.cf edge data. No third party is involved and the
 * visitor's IP never leaves Cloudflare; we only read the geo Cloudflare already
 * resolved at the edge.
 *
 * "Nearest large city" so a suburb IP (e.g. Hialeah) reads as its metro (Miami)
 * instead of the literal town. We snap the viewer's lat/long to the closest
 * metro in a curated list when one is within range; otherwise we use the raw
 * Cloudflare city (still their real city), and the client falls back to Hawaii
 * when there is no city at all.
 *
 * Every other request is delegated to the static assets binding, so all existing
 * pages (and the SPA not_found_handling fallback) behave exactly as before.
 */

// Curated major metros (lat, lng). Covers the bulk of US population plus a few
// large international hubs. Approximate coordinates are fine; we only need the
// nearest one. Honolulu is included so local (and our own) traffic resolves home.
const METROS = [
  ["New York", 40.71, -74.01], ["Los Angeles", 34.05, -118.24], ["Chicago", 41.88, -87.63],
  ["Houston", 29.76, -95.37], ["Phoenix", 33.45, -112.07], ["Philadelphia", 39.95, -75.17],
  ["San Antonio", 29.42, -98.49], ["San Diego", 32.72, -117.16], ["Dallas", 32.78, -96.80],
  ["San Jose", 37.34, -121.89], ["Austin", 30.27, -97.74], ["Jacksonville", 30.33, -81.66],
  ["Columbus", 39.96, -83.00], ["Charlotte", 35.23, -80.84], ["San Francisco", 37.77, -122.42],
  ["Indianapolis", 39.77, -86.16], ["Seattle", 47.61, -122.33], ["Denver", 39.74, -104.99],
  ["Washington", 38.91, -77.04], ["Boston", 42.36, -71.06], ["Nashville", 36.16, -86.78],
  ["Portland", 45.52, -122.68], ["Las Vegas", 36.17, -115.14], ["Detroit", 42.33, -83.05],
  ["Memphis", 35.15, -90.05], ["Louisville", 38.25, -85.76], ["Baltimore", 39.29, -76.61],
  ["Milwaukee", 43.04, -87.91], ["Atlanta", 33.75, -84.39], ["Miami", 25.76, -80.19],
  ["Orlando", 28.54, -81.38], ["Tampa", 27.95, -82.46], ["Minneapolis", 44.98, -93.27],
  ["Kansas City", 39.10, -94.58], ["St. Louis", 38.63, -90.20], ["Pittsburgh", 40.44, -79.996],
  ["Cincinnati", 39.10, -84.51], ["Cleveland", 41.50, -81.69], ["Salt Lake City", 40.76, -111.89],
  ["Sacramento", 38.58, -121.49], ["Raleigh", 35.78, -78.64], ["New Orleans", 29.95, -90.07],
  ["Oklahoma City", 35.47, -97.52], ["Albuquerque", 35.08, -106.65], ["Honolulu", 21.31, -157.86],
  ["London", 51.51, -0.13], ["Toronto", 43.65, -79.38], ["Vancouver", 49.28, -123.12],
  ["Sydney", -33.87, 151.21], ["Singapore", 1.35, 103.82], ["Dublin", 53.35, -6.26],
];

// Snap to the nearest listed metro within ~100 miles; else null (keep raw city).
const SNAP_MILES = 100;
function nearestMetro(lat, lng) {
  let best = null;
  let bestMi = Infinity;
  for (const [name, mlat, mlng] of METROS) {
    const dLat = (mlat - lat) * (Math.PI / 180);
    const dLng = (mlng - lng) * (Math.PI / 180);
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(lat * (Math.PI / 180)) * Math.cos(mlat * (Math.PI / 180)) * Math.sin(dLng / 2) ** 2;
    const mi = 3958.8 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    if (mi < bestMi) {
      bestMi = mi;
      best = name;
    }
  }
  return bestMi <= SNAP_MILES ? best : null;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/geo") {
      const cf = request.cf || {};
      const lat = parseFloat(cf.latitude);
      const lng = parseFloat(cf.longitude);
      let city = cf.city || null;
      if (Number.isFinite(lat) && Number.isFinite(lng)) {
        const metro = nearestMetro(lat, lng);
        if (metro) city = metro;
      }
      const body = JSON.stringify({
        city,
        region: cf.region || null,
        country: cf.country || null,
        rawCity: cf.city || null,
      });
      return new Response(body, {
        headers: {
          "content-type": "application/json; charset=utf-8",
          // per-visitor; must never be cached at the edge or in the browser
          "cache-control": "no-store",
        },
      });
    }

    // No custom handling: serve the static asset (or the SPA fallback).
    return env.ASSETS.fetch(request);
  },
};
