"use client";

import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
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
    <div className="flex min-h-screen flex-col app-canvas-mobile">
      <header className="sticky top-0 z-40 border-b border-slate-200/90 bg-white shadow-sm">
        <div className="page-container flex h-14 items-center justify-between gap-3">
          <div className="flex min-w-0 items-center">
            <BrandLogo size="sm" className="min-w-0" />
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <span className="max-w-[7rem] truncate rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
              {firstName}
            </span>
            <button
              type="button"
              onClick={handleLogout}
              className="flex h-9 w-9 items-center justify-center rounded-full text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
              aria-label="Sair"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </header>

      <main className="page-container flex-1 py-4 pb-[calc(5.5rem+env(safe-area-inset-bottom,0px))]">
        {children}
      </main>

      <nav
        className="fixed inset-x-0 bottom-0 z-50 border-t border-slate-200 bg-white shadow-[0_-8px_30px_rgb(15_23_42/0.08)] safe-bottom"
        aria-label="Navegação principal"
      >
        <div className="page-container flex">
          {BOTTOM_NAV.map(({ href, label, icon: Icon, match }) => {
            const active = match(pathname);
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "relative flex min-h-[3.25rem] flex-1 flex-col items-center justify-center gap-0.5 py-2 text-[10px] font-semibold transition",
                  active ? "text-brand" : "text-slate-400"
                )}
              >
                {active && (
                  <span
                    className="absolute inset-x-4 top-0 h-0.5 rounded-full bg-brand"
                    aria-hidden
                  />
                )}
                <Icon className={cn("h-5 w-5", active && "stroke-[2.25]")} />
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
