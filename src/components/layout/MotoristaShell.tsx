"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { BrandLogo } from "@/components/brand/BrandLogo";
import { PanelShellHeader } from "@/components/brand/PanelShellHeader";
import { cn } from "@/lib/utils";
import { Truck, ClipboardList, ListOrdered, LogOut } from "lucide-react";
import type { Profile } from "@/lib/types";

const NAV = [
  { href: "/motorista", label: "Início", icon: Truck, exact: true },
  { href: "/checkin", label: "Check-in", icon: ClipboardList, exact: false },
  { href: "/minha-fila", label: "Minha fila", icon: ListOrdered, exact: false },
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
              <p className="mt-0.5 truncate text-xs font-semibold text-red-600" role="status">
                {checkinBlockHint}
              </p>
            )}
          </div>
        }
        trailing={
          <button
            type="button"
            onClick={logout}
            className="flex shrink-0 items-center gap-1.5 rounded-xl border border-slate-200/80 bg-white px-3 py-2 text-xs font-medium text-slate-500 shadow-sm transition hover:bg-slate-50"
            aria-label="Sair"
          >
            <LogOut className="h-4 w-4" />
            Sair
          </button>
        }
      />

      <main className="page-container py-5">{children}</main>

      <nav
        className="fixed bottom-0 left-0 right-0 z-40 border-t border-slate-200/80 bg-white/95 shadow-[0_-4px_24px_rgb(15_23_42/0.06)] backdrop-blur-lg safe-bottom"
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
