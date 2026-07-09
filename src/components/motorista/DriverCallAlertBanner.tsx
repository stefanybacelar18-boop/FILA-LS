"use client";

import { BellRing } from "lucide-react";
import {
  DRIVER_CALL_BANNER_BODY,
  DRIVER_CALL_BANNER_TITLE,
} from "@/lib/driver-notification-copy";

export function DriverCallAlertBanner({
  visible,
  onDismiss,
}: {
  visible: boolean;
  onDismiss: () => void;
}) {
  if (!visible) return null;

  return (
    <div
      className="fixed inset-x-0 top-[calc(3.5rem+env(safe-area-inset-top,0px))] z-50 mx-3 rounded-2xl border-2 border-emerald-500 bg-emerald-100 px-4 py-4 text-emerald-900 shadow-lg ring-2 ring-emerald-300/70"
      role="status"
      aria-live="assertive"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 rounded-full bg-emerald-600 p-2 text-white animate-pulse">
            <BellRing className="h-5 w-5" />
          </div>
          <div>
            <p className="text-base font-bold uppercase tracking-wide">{DRIVER_CALL_BANNER_TITLE}</p>
            <p className="mt-1 text-sm font-medium text-emerald-900">{DRIVER_CALL_BANNER_BODY}</p>
          </div>
        </div>
        <button
          type="button"
          className="shrink-0 rounded-md border border-emerald-500 bg-white px-2.5 py-1.5 text-xs font-semibold text-emerald-900"
          onClick={onDismiss}
        >
          Entendi
        </button>
      </div>
    </div>
  );
}
