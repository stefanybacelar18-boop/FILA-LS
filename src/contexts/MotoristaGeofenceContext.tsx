"use client";

import { createContext, useContext } from "react";
import { useMotoristaGeofence } from "@/hooks/useMotoristaGeofence";

type MotoristaGeofenceContextValue = ReturnType<typeof useMotoristaGeofence>;

const MotoristaGeofenceContext = createContext<MotoristaGeofenceContextValue | null>(null);

export function MotoristaGeofenceProvider({
  enabled,
  children,
}: {
  enabled: boolean;
  children: React.ReactNode;
}) {
  const value = useMotoristaGeofence(enabled);
  return (
    <MotoristaGeofenceContext.Provider value={value}>{children}</MotoristaGeofenceContext.Provider>
  );
}

export function useMotoristaGeofenceContext(): MotoristaGeofenceContextValue {
  const ctx = useContext(MotoristaGeofenceContext);
  if (!ctx) {
    throw new Error("useMotoristaGeofenceContext must be used within MotoristaGeofenceProvider");
  }
  return ctx;
}
