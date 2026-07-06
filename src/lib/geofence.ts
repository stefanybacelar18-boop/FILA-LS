import { DEFAULT_GEOFENCE } from "./constants";
import type { GeofenceConfig } from "./types";

const EARTH_RADIUS_METERS = 6371000;

export const GEOFENCE_RADIUS_MIN = 50;
export const GEOFENCE_RADIUS_MAX = 5000;

export function clampGeofenceRadius(radius: unknown): number {
  const n = typeof radius === "number" ? radius : Number(radius);
  if (!Number.isFinite(n)) return DEFAULT_GEOFENCE.radius_meters;
  return Math.min(
    GEOFENCE_RADIUS_MAX,
    Math.max(GEOFENCE_RADIUS_MIN, Math.round(n))
  );
}

export function normalizeGeofenceConfig(raw: unknown): GeofenceConfig {
  const base =
    typeof raw === "object" && raw !== null
      ? (raw as Partial<GeofenceConfig>)
      : {};

  const lat =
    typeof base.lat === "number" && Number.isFinite(base.lat)
      ? base.lat
      : DEFAULT_GEOFENCE.lat;
  const lng =
    typeof base.lng === "number" && Number.isFinite(base.lng)
      ? base.lng
      : DEFAULT_GEOFENCE.lng;
  const name =
    typeof base.name === "string" && base.name.trim()
      ? base.name.trim()
      : DEFAULT_GEOFENCE.name;

  return {
    lat,
    lng,
    name,
    radius_meters: clampGeofenceRadius(base.radius_meters),
  };
}

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
