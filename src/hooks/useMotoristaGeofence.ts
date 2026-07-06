"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { DEFAULT_GEOFENCE } from "@/lib/constants";
import { skipGeofence } from "@/lib/dev-flags";
import type { GeofenceConfig } from "@/lib/types";
import {
  formatDistance,
  getCurrentPosition,
  haversineDistance,
  isSecureGeolocationContext,
  isWithinGeofence,
  normalizeGeofenceConfig,
} from "@/lib/geofence";

export type GeofenceStep =
  | "loading"
  | "denied"
  | "outside"
  | "inside"
  | "error"
  | "insecure"
  | "skipped";

export function useMotoristaGeofence(enabled = true) {
  const supabase = createClient();
  const skipGeofenceDev = skipGeofence();
  const [geofence, setGeofence] = useState<GeofenceConfig>(DEFAULT_GEOFENCE);
  const [step, setStep] = useState<GeofenceStep>("loading");
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [distance, setDistance] = useState<number | null>(null);

  useEffect(() => {
    if (!enabled) return;
    async function loadGeofence() {
      const { data } = await supabase
        .from("settings")
        .select("value")
        .eq("key", "geofence")
        .single();
      if (data?.value && typeof data.value === "object") {
        setGeofence(normalizeGeofenceConfig(data.value));
      }
    }
    void loadGeofence();
  }, [enabled, supabase]);

  const validateLocation = useCallback(async () => {
    if (!enabled) {
      setStep("skipped");
      return;
    }
    if (skipGeofenceDev) {
      setCoords({ lat: geofence.lat, lng: geofence.lng });
      setStep("skipped");
      return;
    }
    if (!isSecureGeolocationContext()) {
      setStep("insecure");
      return;
    }
    setStep("loading");
    setCoords(null);
    setDistance(null);
    try {
      const position = await getCurrentPosition();
      const lat = position.coords.latitude;
      const lng = position.coords.longitude;
      setCoords({ lat, lng });
      const dist = haversineDistance(lat, lng, geofence.lat, geofence.lng);
      setDistance(dist);
      setStep(isWithinGeofence(lat, lng, geofence) ? "inside" : "outside");
    } catch (err) {
      const error = err as GeolocationPositionError & Error;
      if (error.message === "insecure_context") {
        setStep("insecure");
      } else {
        setStep(error.code === 1 ? "denied" : "error");
      }
    }
  }, [enabled, geofence, skipGeofenceDev]);

  useEffect(() => {
    void validateLocation();
  }, [validateLocation]);

  const canCheckIn = step === "inside" || step === "skipped";
  const isOutside = step === "outside";

  return {
    step,
    geofence,
    coords,
    distance,
    distanceLabel: distance != null ? formatDistance(distance) : null,
    canCheckIn,
    isOutside,
    skipGeofence: skipGeofenceDev,
    retry: validateLocation,
  };
}
