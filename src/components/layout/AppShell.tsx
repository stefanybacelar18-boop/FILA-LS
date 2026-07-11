"use client";

import Link from "next/link";
import type { ElementType } from "react";
import { usePathname, useRouter } from "next/navigation";
import { ROLE_LABELS } from "@/lib/constants";
import { PanelShellHeader } from "@/components/brand/PanelShellHeader";
import { toAppRole } from "@/lib/types";
import { cn, getNameInitial, getProfileDisplayName } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/Button";
import {
  LayoutDashboard,
  ListOrdered,
  History,
  Settings,
  Tv,
  LogOut,
  ClipboardList,
  FileSpreadsheet,
  Table2,
} from "lucide-react";
import type { UserRole } from "@/lib/types";
import {
  canAccessAdmin,
  canAccessCheckinsRegistry,
  canAccessDashboard,
  canAccessHistorico,
  isStaffQueueRole,
} from "@/lib/role-permissions";

const NAV_ITEMS: {
  href: string | ((role: string) => string);
  label: string | ((role: string) => string);
  icon: ElementType;
  visible: (role: string) => boolean;
}[] = [
  {
    href: (role) => (toAppRole(role) === "administrador" ? "/admin/fila" : "/empilhador"),
    label: "Fila",
    icon: ListOrdered,
    visible: isStaffQueueRole,
  },
  {
    href: (role) =>
      toAppRole(role) === "administrador" ? "/dashboard" : "/empilhador/dashboard",
    label: (role) => (toAppRole(role) === "administrador" ? "Dashboard" : "Resumo"),
    icon: LayoutDashboard,
    visible: canAccessDashboard,
  },
  {
    href: "/historico",
    label: "Histórico",
    icon: History,
    visible: canAccessHistorico,
  },
  {
    href: "/admin/checkins",
    label: "Check-ins",
    icon: ClipboardList,
    visible: canAccessCheckinsRegistry,
  },
  {
    href: "/admin/minutas",
    label: "Minutas",
    icon: FileSpreadsheet,
    visible: canAccessAdmin,
  },
  {
    href: "/admin/volu-recebimento",
    label: "Volu",
    icon: Table2,
    visible: canAccessAdmin,
  },
  {
    href: "/tv",
    label: "Painel TV",
    icon: Tv,
    visible: isStaffQueueRole,
  },
  {
    href: "/admin",
    label: "Administração",
    icon: Settings,
    visible: canAccessAdmin,
  },
];

function isNavActive(pathname: string, href: string): boolean {
  if (href === "/admin") return pathname === "/admin";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function AppShell({
  children,
  role,
  userName,
  userEmail,
}: {
  children: React.ReactNode;
  role?: UserRole;
  userName?: string | null;
  userEmail?: string | null;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createClient();
  const displayName = getProfileDisplayName(userName, userEmail);

  const visibleNav = role
    ? NAV_ITEMS.filter((item) => item.visible(role)).map((item) => ({
        ...item,
        href: typeof item.href === "function" ? item.href(role) : item.href,
        label: typeof item.label === "function" ? item.label(role) : item.label,
      }))
    : [];

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <div className="min-h-screen app-canvas-admin">
      <PanelShellHeader
        layout="admin"
        logoHref="/"
        trailing={
          <>
            {role && (
              <div className="hidden items-center gap-2.5 md:flex">
                <div className="text-right">
                  <p className="text-sm font-semibold text-slate-800">{displayName}</p>
                  <span className="role-badge mt-0.5">{ROLE_LABELS[toAppRole(role)]}</span>
                </div>
                <div
                  className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-muted text-xs font-bold text-brand"
                  aria-hidden
                >
                  {getNameInitial(displayName)}
                </div>
              </div>
            )}
            {role && (
              <Button variant="ghost" size="sm" onClick={handleLogout} className="text-slate-500">
                <LogOut className="h-4 w-4" />
                <span className="hidden sm:inline">Sair</span>
              </Button>
            )}
          </>
        }
      />

      {role && (
        <>
          <nav
            className="hidden border-b border-brand/10 bg-white lg:block"
            aria-label="Navegação principal"
          >
            <div className="page-container-admin flex gap-1 py-1.5">
              {visibleNav.map((item) => {
                const Icon = item.icon;
                const active = isNavActive(pathname, item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                      active
                        ? "bg-brand-muted/90 font-semibold text-brand-dark"
                        : "text-slate-500 hover:bg-slate-50 hover:text-slate-700"
                    )}
                  >
                    <Icon className="h-4 w-4 shrink-0 opacity-80" />
                    {item.label}
                  </Link>
                );
              })}
            </div>
          </nav>

          <nav
            className="flex gap-1 overflow-x-auto border-b border-brand/10 bg-white px-3 py-1.5 lg:hidden snap-x snap-mandatory"
            aria-label="Navegação principal"
          >
            {visibleNav.map((item) => {
              const Icon = item.icon;
              const active = isNavActive(pathname, item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex shrink-0 snap-start items-center gap-1.5 rounded-lg px-3 py-2.5 text-xs font-medium transition-colors",
                    active
                      ? "bg-brand-muted/90 font-semibold text-brand-dark shadow-sm"
                      : "text-slate-500 hover:bg-slate-50 hover:text-slate-700"
                  )}
                >
                  <Icon className="h-3.5 w-3.5 shrink-0" />
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </>
      )}

      <main className="page-container-admin shell-main shell-main--admin">{children}</main>
    </div>
  );
}
