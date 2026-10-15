/** Haversine distance in metres between two WGS84 points. */
export function distanceMetres(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(a)));
}

export const GEOFENCE_MAX_METRES = 500;

export function isWithinParcel(
  pin: { lat: number; lng: number },
  parcel: { lat: number; lng: number },
  maxMetres = GEOFENCE_MAX_METRES,
): { accepted: boolean; distanceM: number } {
  const distanceM = distanceMetres(pin.lat, pin.lng, parcel.lat, parcel.lng);
  return { accepted: distanceM <= maxMetres, distanceM };
}

/** Extract a point from GeoJSON Point or {lat,lng} stored on land_holdings.coordinates. */
export function parcelCenter(coordinates: unknown): { lat: number; lng: number } | null {
  if (!coordinates || typeof coordinates !== "object") return null;
  const c = coordinates as Record<string, unknown>;
  if (typeof c.lat === "number" && typeof c.lng === "number") {
    return { lat: c.lat, lng: c.lng };
  }
  if (c.type === "Point" && Array.isArray(c.coordinates) && c.coordinates.length >= 2) {
    return { lng: Number(c.coordinates[0]), lat: Number(c.coordinates[1]) };
  }
  return null;
}
