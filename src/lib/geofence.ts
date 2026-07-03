import type { GeofenceConfig } from "./types";

const EARTH_RADIUS_METERS = 6371000;

function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

export function haversineDistance(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const dLat = toRadians(lat2 - lat1);
  const dLng = toRadians(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(lat1)) *
      Math.cos(toRadians(lat2)) *
      Math.sin(dLng / 2) ** 2;
  return EARTH_RADIUS_METERS * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function isWithinGeofence(
  lat: number,
  lng: number,
  geofence: GeofenceConfig
): boolean {
  const distance = haversineDistance(lat, lng, geofence.lat, geofence.lng);
  return distance <= geofence.radius_meters;
}

export function getCurrentPosition(): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    if (typeof window !== "undefined" && !window.isSecureContext) {
      const err = new Error("insecure_context") as Error & { code?: number };
      err.code = 0;
      reject(err);
      return;
    }
    if (!navigator.geolocation) {
      reject(new Error("Geolocalização não suportada neste dispositivo."));
      return;
    }
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: true,
      timeout: 15000,
      maximumAge: 0,
    });
  });
}

export function isSecureGeolocationContext(): boolean {
  return typeof window !== "undefined" && window.isSecureContext;
}

export function formatDistance(meters: number): string {
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toFixed(1)} km`;
}
