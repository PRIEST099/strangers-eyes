const R = 6_371_008.8; // mean Earth radius, metres (IUGG)
const rad = (d: number) => (d * Math.PI) / 180;

export function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const dLat = rad(lat2 - lat1);
  const dLng = rad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}

export type Band = 'street' | 'neighbourhood' | 'district' | 'city' | 'country' | 'none';
export function bandFor(meters: number): Band {
  if (meters <= 250) return 'street';
  if (meters <= 1_000) return 'neighbourhood';
  if (meters <= 5_000) return 'district';
  if (meters <= 30_000) return 'city';
  if (meters <= 500_000) return 'country';
  return 'none';
}

export function currentPosition(opts: PositionOptions = {}): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    if (!('geolocation' in navigator)) return reject(new Error('Geolocation unsupported'));
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: true,
      timeout: 15_000,
      maximumAge: 0,
      ...opts,
    });
  });
}
