"use client";

import { createContext, useContext } from "react";
import { useDriverQueueData } from "@/hooks/useDriverQueueData";
import type { Profile } from "@/lib/types";

type DriverQueueContextValue = ReturnType<typeof useDriverQueueData>;

const DriverQueueContext = createContext<DriverQueueContextValue | null>(null);

export function DriverQueueProvider({
  profile,
  children,
}: {
  profile: Profile;
  children: React.ReactNode;
}) {
  const value = useDriverQueueData(profile);
  return <DriverQueueContext.Provider value={value}>{children}</DriverQueueContext.Provider>;
}

export function useDriverQueueContext(): DriverQueueContextValue {
  const ctx = useContext(DriverQueueContext);
  if (!ctx) {
    throw new Error("useDriverQueueContext must be used within DriverQueueProvider");
  }
  return ctx;
}
