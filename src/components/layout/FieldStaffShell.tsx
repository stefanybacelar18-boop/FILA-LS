"use client";

import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { PanelShellHeader } from "@/components/brand/PanelShellHeader";
import { Button } from "@/components/ui/Button";
import { cn, getDriverFirstName, getProfileDisplayName } from "@/lib/utils";
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
  userName?: string | null;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const supabase = createClient();
  const firstName = getDriverFirstName(getProfileDisplayName(userName));

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <div className="flex min-h-screen flex-col app-canvas-mobile">
      <PanelShellHeader
        trailing={
          <>
            <span className="max-w-[7rem] truncate rounded-full bg-brand-muted/80 px-3 py-1 text-xs font-semibold text-brand-dark">
              {firstName}
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleLogout}
              className="h-9 w-9 rounded-full p-0 text-slate-400"
              aria-label="Sair"
            >
              <LogOut className="h-4 w-4" />
            </Button>
          </>
        }
      />

      <main className="page-container shell-main flex-1 pb-[calc(5.5rem+env(safe-area-inset-bottom,0px))]">
        {children}
      </main>

      <nav
        className="fixed inset-x-0 bottom-0 z-50 border-t border-brand/12 bg-white/95 shadow-[0_-8px_30px_rgb(21_101_192/0.1)] backdrop-blur-lg safe-bottom"
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

export { PanelPageTitle as FieldStaffPageTitle } from "@/components/brand/PanelShellHeader";
