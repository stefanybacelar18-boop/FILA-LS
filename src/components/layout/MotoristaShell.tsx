"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { BrandLogo } from "@/components/brand/BrandLogo";
import { PanelShellHeader } from "@/components/brand/PanelShellHeader";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";
import { ClipboardList, ListOrdered, LogOut } from "lucide-react";
import type { Profile } from "@/lib/types";

const NAV = [
  { href: "/checkin", label: "Check-in", icon: ClipboardList, exact: false },
  { href: "/motorista", label: "Fila", icon: ListOrdered, exact: true },
];

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
    <div className="min-h-screen app-canvas-mobile pb-[calc(4.5rem+env(safe-area-inset-bottom))]">
      <PanelShellHeader
        logoHref="/motorista"
        leading={
          <div className="min-w-0">
            <BrandLogo size="sm" />
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
          <Button variant="ghost" size="sm" onClick={logout} className="text-slate-500" aria-label="Sair">
            <LogOut className="h-4 w-4" />
            Sair
          </Button>
        }
      />

      <main className="page-container shell-main">{children}</main>

      <nav
        className="fixed bottom-0 left-0 right-0 z-40 border-t border-brand/10 bg-white/95 shadow-[0_-4px_24px_rgb(21_101_192/0.08)] backdrop-blur-lg safe-bottom"
        aria-label="Navegação principal"
      >
        <div className="page-container flex justify-around gap-1 py-1.5">
          {NAV.map(({ href, label, icon: Icon, exact }) => {
            const active = exact ? pathname === href : pathname.startsWith(href);
            const disabled = href === "/checkin" && !checkinNavEnabled;
            if (disabled) {
              return (
                <span
                  key={href}
                  aria-disabled="true"
                  aria-describedby={checkinBlockHint ? "checkin-block-hint" : undefined}
                  className="flex min-h-[52px] flex-1 flex-col items-center justify-center gap-0.5 rounded-xl text-[11px] font-semibold text-slate-300"
                  title="Check-in disponível apenas dentro do pátio"
                >
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-transparent">
                    <Icon className="h-5 w-5" />
                  </div>
                  {label}
                </span>
              );
            }
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex min-h-[52px] flex-1 flex-col items-center justify-center gap-0.5 rounded-xl text-[11px] font-semibold transition",
                  active ? "text-brand" : "text-slate-400 hover:text-slate-600"
                )}
              >
                <div
                  className={cn(
                    "flex h-9 w-9 items-center justify-center rounded-xl transition",
                    active
                      ? "bg-brand-muted shadow-sm ring-1 ring-brand/15"
                      : "bg-transparent"
                  )}
                >
                  <Icon className={cn("h-5 w-5", active && "stroke-[2.5]")} />
                </div>
                {label}
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
