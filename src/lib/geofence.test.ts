import { describe, expect, it } from "vitest";
import {
  clampGeofenceRadius,
  formatDistance,
  haversineDistance,
  isWithinGeofence,
  normalizeGeofenceConfig,
} from "./geofence";
import { DEFAULT_GEOFENCE } from "./constants";

describe("clampGeofenceRadius", () => {
  it("limita ao intervalo permitido", () => {
    expect(clampGeofenceRadius(10)).toBe(50);
    expect(clampGeofenceRadius(99999)).toBe(5000);
    expect(clampGeofenceRadius(300)).toBe(300);
  });
});

describe("normalizeGeofenceConfig", () => {
  it("usa defaults para valores inválidos", () => {
    const config = normalizeGeofenceConfig({ lat: NaN, lng: "x" });
    expect(config.lat).toBe(DEFAULT_GEOFENCE.lat);
    expect(config.lng).toBe(DEFAULT_GEOFENCE.lng);
  });
});

describe("isWithinGeofence", () => {
  it("aceita ponto no centro", () => {
    expect(isWithinGeofence(DEFAULT_GEOFENCE.lat, DEFAULT_GEOFENCE.lng, DEFAULT_GEOFENCE)).toBe(
      true
    );
  });

  it("rejeita ponto distante", () => {
    expect(isWithinGeofence(0, 0, DEFAULT_GEOFENCE)).toBe(false);
  });
});

describe("haversineDistance", () => {
  it("distância zero para o mesmo ponto", () => {
    expect(haversineDistance(-3.1, -60.0, -3.1, -60.0)).toBe(0);
  });
});

describe("formatDistance", () => {
  it("formata metros e quilômetros", () => {
    expect(formatDistance(450)).toBe("450 m");
    expect(formatDistance(1500)).toBe("1.5 km");
  });
});
