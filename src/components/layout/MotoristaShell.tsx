"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { BrandLogo } from "@/components/brand/BrandLogo";
import { PanelShellHeader } from "@/components/brand/PanelShellHeader";
import { MobileBottomNav } from "@/components/ui/MobileBottomNav";
import { Button } from "@/components/ui/Button";
import { ClipboardList, ListOrdered, LogOut } from "lucide-react";
import { useEffect } from "react";
import { unlockDriverCallSound } from "@/lib/driver-call-sound";
import { DriverQueueProvider, useDriverQueueContext } from "@/contexts/DriverQueueContext";
import { useDriverCallAlert } from "@/hooks/useDriverCallAlert";
import { DriverCallAlertBanner } from "@/components/motorista/DriverCallAlertBanner";
import { useDriverPushSubscription } from "@/hooks/useDriverPushSubscription";
import { useMotoristaGeofence } from "@/hooks/useMotoristaGeofence";
import type { Profile } from "@/lib/types";

function MotoristaShellInner({
  profile,
  children,
  checkinNavOverride,
  checkinBlockHintOverride,
}: {
  profile: Profile;
  children: React.ReactNode;
  checkinNavOverride?: boolean;
  checkinBlockHintOverride?: string | null;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createClient();
  const firstName = profile.full_name?.split(" ")?.[0] ?? "Motorista";
  const { syncError } = useDriverPushSubscription(true);
  const { entry, loading } = useDriverQueueContext();
  const geo = useMotoristaGeofence(checkinNavOverride === undefined && !loading);
  const hasEntry = !!entry;
  const geoLoading = geo.step === "loading" && !geo.skipGeofence;

  const checkinNavEnabled =
    checkinNavOverride ?? (hasEntry || geo.canCheckIn || geoLoading);

  const checkinBlockHint =
    checkinBlockHintOverride ??
    (!hasEntry && !geo.canCheckIn && !geoLoading
      ? geo.step === "outside"
        ? "Check-in bloqueado — fora do pátio"
        : geo.step === "denied"
          ? "Check-in bloqueado — ative o GPS"
          : geo.step === "loading"
            ? null
            : "Check-in bloqueado — valide a localização"
      : null);

  useEffect(() => {
    const unlock = () => unlockDriverCallSound();
    document.addEventListener("touchstart", unlock, { passive: true });
    document.addEventListener("click", unlock, { passive: true });
    return () => {
      document.removeEventListener("touchstart", unlock);
      document.removeEventListener("click", unlock);
    };
  }, []);

  async function logout() {
    await supabase.auth.signOut();
    router.push("/login/motorista");
  }

  return (
    <div className="flex min-h-screen flex-col app-canvas-mobile pb-[calc(4.5rem+env(safe-area-inset-bottom,0px))]">
      <PanelShellHeader
        logoHref="/motorista"
        leading={
          <div className="min-w-0">
            <Link href="/motorista" className="inline-flex">
              <BrandLogo size="sm" />
            </Link>
            <p className="mt-1 truncate text-sm font-semibold text-slate-800">Olá, {firstName}</p>
            {!checkinNavEnabled && checkinBlockHint && (
              <p
                id="checkin-block-hint"
                className="mt-0.5 truncate text-xs font-semibold text-red-600"
                role="status"
              >
                {checkinBlockHint}
              </p>
            )}
          </div>
        }
        trailing={
          <Button
            variant="ghost"
            size="sm"
            onClick={logout}
            className="h-10 rounded-xl px-2.5 text-slate-500"
            aria-label="Sair"
          >
            <LogOut className="h-4 w-4" />
          </Button>
        }
      />

      {syncError && (
        <p className="mx-4 -mt-2 mb-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-900">
          {syncError}
        </p>
      )}

      <main className="page-container shell-main flex-1">{children}</main>

      <MobileBottomNav
        items={[
          {
            key: "checkin",
            label: "Check-in",
            icon: ClipboardList,
            active: pathname.startsWith("/checkin"),
            href: "/checkin",
            disabled: !checkinNavEnabled,
            disabledTitle: "Check-in disponível apenas dentro do pátio",
            describedBy: checkinBlockHint ? "checkin-block-hint" : undefined,
          },
          {
            key: "fila",
            label: "Minha fila",
            icon: ListOrdered,
            active: pathname === "/motorista",
            href: "/motorista",
          },
        ]}
      />
    </div>
  );
}

function MotoristaCallAlertLayer({ children }: { children: React.ReactNode }) {
  const { entry } = useDriverQueueContext();
  const { showCallAlert, dismissCallAlert } = useDriverCallAlert(
    entry?.id ?? null,
    entry?.called_at ?? null
  );

  return (
    <>
      <DriverCallAlertBanner visible={showCallAlert} onDismiss={dismissCallAlert} />
      {children}
    </>
  );
}

export function MotoristaShell({
  profile,
  children,
  checkinNavEnabled,
  checkinBlockHint,
}: {
  profile: Profile;
  children: React.ReactNode;
  checkinNavEnabled?: boolean;
  checkinBlockHint?: string | null;
}) {
  return (
    <DriverQueueProvider profile={profile}>
      <MotoristaCallAlertLayer>
        <MotoristaShellInner
          profile={profile}
          checkinNavOverride={checkinNavEnabled}
          checkinBlockHintOverride={checkinBlockHint}
        >
          {children}
        </MotoristaShellInner>
      </MotoristaCallAlertLayer>
    </DriverQueueProvider>
  );
}
