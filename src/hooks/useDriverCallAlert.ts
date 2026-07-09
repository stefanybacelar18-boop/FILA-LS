"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { isDriverPushSupported } from "@/lib/driver-push-client";
import { playDriverCallAlert } from "@/lib/driver-call-sound";

function vibrateCall() {
  if ("vibrate" in navigator) {
    navigator.vibrate([300, 150, 300, 150, 500]);
  }
}

/** Alerta de chamada (som + vibração) em qualquer rota do motorista. */
export function useDriverCallAlert(entryId: string | null, calledAt: string | null) {
  const [showCallAlert, setShowCallAlert] = useState(false);
  const initializedRef = useRef(false);
  const lastMarkerRef = useRef<string | null>(null);

  const fireCallAlert = useCallback(() => {
    setShowCallAlert(true);
    vibrateCall();
    void playDriverCallAlert();
  }, []);

  useEffect(() => {
    if (!isDriverPushSupported()) return;

    function onSwMessage(event: MessageEvent) {
      const data = event.data as { type?: string } | null;
      if (data?.type !== "DRIVER_CALLED") return;
      fireCallAlert();
    }

    navigator.serviceWorker.addEventListener("message", onSwMessage);
    return () => navigator.serviceWorker.removeEventListener("message", onSwMessage);
  }, [fireCallAlert]);

  useEffect(() => {
    const marker = entryId ? `${entryId}:${calledAt ?? ""}` : null;

    if (!initializedRef.current) {
      initializedRef.current = true;
      lastMarkerRef.current = marker;
      return;
    }

    if (!calledAt) {
      lastMarkerRef.current = marker;
      return;
    }

    if (lastMarkerRef.current === marker) return;

    fireCallAlert();
    lastMarkerRef.current = marker;
  }, [entryId, calledAt, fireCallAlert]);

  return {
    showCallAlert,
    dismissCallAlert: () => setShowCallAlert(false),
  };
}
