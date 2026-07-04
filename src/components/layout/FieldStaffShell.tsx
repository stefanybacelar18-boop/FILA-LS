"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { BrandLogo } from "@/components/brand/BrandLogo";
import { cn } from "@/lib/utils";
import { LogOut, ListOrdered, LayoutDashboard } from "lucide-react";

const BOTTOM_NAV = [
  { href: "/empilhador", label: "Fila", icon: ListOrdered, match: (p: string) => p === "/empilhador" },
  {
    href: "/empilhador/dashboard",
    label: "Resumo",
    icon: LayoutDashboard,
    match: (p: string) => p.startsWith("/empilhador/dashboard"),
  },
] as const;

/** Shell mobile para empilhador (celular no pátio) */
export function FieldStaffShell({
  children,
  userName,
}: {
  children: React.ReactNode;
  userName?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const supabase = createClient();
  const firstName = userName?.split(" ")[0] ?? "Operador";

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <div className="min-h-screen app-canvas-mobile pb-24">
      <header className="sticky top-0 z-40 border-b border-slate-200/80 bg-white/90 backdrop-blur-lg">
        <div className="border-t-[3px] border-brand" aria-hidden />
        <div className="page-container flex items-center justify-between py-3">
          <BrandLogo size="xs" showCompany />
          <div className="flex items-center gap-2">
            <div className="text-right">
              <p className="truncate text-sm font-semibold text-slate-800">
                {firstName}
              </p>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                Empilhador
              </p>
            </div>
            <button
              type="button"
              onClick={handleLogout}
              className="flex shrink-0 items-center gap-1 rounded-xl border border-slate-200/80 bg-white px-2.5 py-2 text-xs font-medium text-slate-500 shadow-sm transition hover:bg-slate-50"
              aria-label="Sair"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </header>

      <main className="page-container py-5">{children}</main>

      <nav
        className="fixed inset-x-0 bottom-0 z-50 border-t border-slate-200/80 bg-white/95 shadow-[0_-4px_24px_rgb(15_23_42/0.06)] backdrop-blur-lg safe-bottom"
        aria-label="Navegação principal"
      >
        <div className="page-container flex items-stretch justify-around gap-1 py-1.5">
          {BOTTOM_NAV.map(({ href, label, icon: Icon, match }) => {
            const active = match(pathname);
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex min-h-[52px] min-w-[4.5rem] flex-1 flex-col items-center justify-center gap-0.5 rounded-xl px-3 py-2 text-[11px] font-semibold transition",
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
                  <Icon className="h-5 w-5" />
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

export function FieldStaffPageTitle({
  title,
  subtitle,
  icon: Icon = ListOrdered,
}: {
  title: string;
  subtitle?: string;
  icon?: React.ElementType;
}) {
  return (
    <div className="mb-5 rounded-[var(--radius-card)] border border-slate-200/90 bg-white p-4 shadow-[var(--shadow-card)]">
      <div className="flex items-start gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-muted text-brand ring-1 ring-brand/10">
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0 border-l border-slate-100 pl-3">
          <p className="section-eyebrow">Operação</p>
          <h1 className="text-lg font-bold tracking-tight text-slate-900">{title}</h1>
          {subtitle && (
            <p className="mt-0.5 text-sm leading-snug text-slate-500">{subtitle}</p>
          )}
        </div>
      </div>
    </div>
  );
}
