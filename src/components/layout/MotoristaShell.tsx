"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { BrandLogo } from "@/components/brand/BrandLogo";
import { PanelShellHeader } from "@/components/brand/PanelShellHeader";
import { MobileBottomNav } from "@/components/ui/MobileBottomNav";
import { Button } from "@/components/ui/Button";
import { ClipboardList, ListOrdered, LogOut } from "lucide-react";
import type { Profile } from "@/lib/types";

export function MotoristaShell({
  profile,
  children,
  checkinNavEnabled = true,
  checkinBlockHint,
}: {
  profile: Profile;
  children: React.ReactNode;
  checkinNavEnabled?: boolean;
  checkinBlockHint?: string | null;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createClient();
  const firstName = profile.full_name?.split(" ")?.[0] ?? "Motorista";

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
