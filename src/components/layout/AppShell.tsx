"use client";

import Link from "next/link";
import type { ElementType } from "react";
import { usePathname, useRouter } from "next/navigation";
import { ROLE_LABELS } from "@/lib/constants";
import { BrandLogo } from "@/components/brand/BrandLogo";
import { toAppRole } from "@/lib/types";
import { cn } from "@/lib/utils";
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

export function AppShell({
  children,
  role,
  userName,
}: {
  children: React.ReactNode;
  role?: UserRole;
  userName?: string;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createClient();

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
      <header className="sticky top-0 z-50 border-b border-slate-200/80 bg-white/95 backdrop-blur-lg shadow-[0_1px_0_rgb(15_23_42/0.04)]">
        <div className="border-t-[3px] border-brand" aria-hidden />
        <div className="page-container-admin flex h-[3.75rem] items-center justify-between">
          <Link href="/" className="flex items-center">
            <BrandLogo size="sm" />
          </Link>

          {role && (
          <nav className="hidden items-center gap-0.5 lg:flex" aria-label="Navegação principal">
              {visibleNav.map((item) => {
                const Icon = item.icon;
                const active = pathname.startsWith(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-all",
                      active
                        ? "bg-brand-muted font-semibold text-brand-dark shadow-sm ring-1 ring-brand/20 [&_svg]:text-brand-dark"
                        : "text-slate-600 hover:bg-slate-100/80 hover:text-slate-900"
                    )}
                  >
                    <Icon className="h-4 w-4" />
                    {item.label}
                  </Link>
                );
              })}
            </nav>
          )}

          <div className="flex items-center gap-2">
            {role && userName && (
              <div className="hidden items-center gap-3 md:flex">
                <div className="text-right">
                  <p className="text-sm font-semibold text-slate-800">{userName}</p>
                  <span className="role-badge mt-0.5">
                    {ROLE_LABELS[toAppRole(role)]}
                  </span>
                </div>
                <div
                  className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-muted text-xs font-bold text-brand ring-2 ring-white"
                  aria-hidden
                >
                  {userName.charAt(0).toUpperCase()}
                </div>
              </div>
            )}
            {role && (
              <Button variant="ghost" size="sm" onClick={handleLogout}>
                <LogOut className="h-4 w-4" />
                <span className="hidden sm:inline">Sair</span>
              </Button>
            )}
          </div>
        </div>

        {role && (
          <nav
            className="flex gap-1 overflow-x-auto border-t border-slate-100 px-4 py-2 lg:hidden"
            aria-label="Navegação principal"
          >
            {visibleNav.map((item) => {
              const Icon = item.icon;
              const active = pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold transition",
                    active
                      ? "bg-brand-muted font-semibold text-brand-dark shadow-sm [&_svg]:text-brand-dark"
                      : "text-slate-500 hover:text-slate-700"
                  )}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {item.label}
                </Link>
              );
            })}
          </nav>
        )}
      </header>
      <main className="page-container-admin py-7 lg:py-9">{children}</main>
    </div>
  );
}
