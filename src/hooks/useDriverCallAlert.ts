"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { isDriverPushSupported } from "@/lib/driver-push-client";
import { parseCalledAtMs } from "@/lib/driver-call";
import { playDriverCallAlert } from "@/lib/driver-call-sound";

function vibrateCall() {
  if ("vibrate" in navigator) {
    navigator.vibrate([300, 150, 300, 150, 500]);
  }
}

/** Alerta de chamada (som + vibração) — só quando called_at avança (chamada nova). */
export function useDriverCallAlert(entryId: string | null, calledAt: string | null) {
  const [showCallAlert, setShowCallAlert] = useState(false);
  const initializedRef = useRef(false);
  const lastCallMsRef = useRef(0);
  const entryIdRef = useRef<string | null>(null);

  const fireCallAlert = useCallback(() => {
    setShowCallAlert(true);
    vibrateCall();
    void playDriverCallAlert();
  }, []);

  useEffect(() => {
    if (!isDriverPushSupported()) return;

    function onSwMessage(event: MessageEvent) {
      const data = event.data as { type?: string; payload?: { kind?: string } } | null;
      if (data?.type !== "DRIVER_CALLED") return;
      if (data.payload?.kind && data.payload.kind !== "driver_call") return;
      fireCallAlert();
    }

    navigator.serviceWorker.addEventListener("message", onSwMessage);
    return () => navigator.serviceWorker.removeEventListener("message", onSwMessage);
  }, [fireCallAlert]);

  useEffect(() => {
    const callMs = parseCalledAtMs(calledAt);

    if (!entryId) {
      entryIdRef.current = null;
      lastCallMsRef.current = 0;
      return;
    }

    if (entryIdRef.current !== entryId) {
      entryIdRef.current = entryId;
      lastCallMsRef.current = callMs;
      initializedRef.current = true;
      return;
    }

    if (!initializedRef.current) {
      initializedRef.current = true;
      lastCallMsRef.current = callMs;
      return;
    }

    if (callMs <= 0) {
      lastCallMsRef.current = 0;
      return;
    }

    if (callMs <= lastCallMsRef.current) return;

    fireCallAlert();
    lastCallMsRef.current = callMs;
  }, [entryId, calledAt, fireCallAlert]);

  return {
    showCallAlert,
    dismissCallAlert: () => setShowCallAlert(false),
  };
}
