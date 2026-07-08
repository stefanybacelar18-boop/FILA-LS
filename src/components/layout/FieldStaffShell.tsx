"use client";

import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { PanelShellHeader } from "@/components/brand/PanelShellHeader";
import { MobileBottomNav } from "@/components/ui/MobileBottomNav";
import { Button } from "@/components/ui/Button";
import { getDriverFirstName, getProfileDisplayName } from "@/lib/utils";
import { LogOut, ListOrdered, LayoutDashboard } from "lucide-react";

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
    <div className="flex min-h-screen flex-col app-canvas-mobile pb-[calc(4.5rem+env(safe-area-inset-bottom,0px))]">
      <PanelShellHeader
        trailing={
          <>
            <span className="max-w-[8rem] truncate rounded-full bg-brand-muted/80 px-3 py-1.5 text-xs font-semibold text-brand-dark">
              {firstName}
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleLogout}
              className="h-10 w-10 rounded-xl p-0 text-slate-400"
              aria-label="Sair"
            >
              <LogOut className="h-4 w-4" />
            </Button>
          </>
        }
      />

      <main className="page-container shell-main flex-1">{children}</main>

      <MobileBottomNav
        items={[
          {
            key: "fila",
            label: "Fila",
            icon: ListOrdered,
            active: pathname === "/empilhador",
            href: "/empilhador",
          },
          {
            key: "resumo",
            label: "Resumo",
            icon: LayoutDashboard,
            active: pathname.startsWith("/empilhador/dashboard"),
            href: "/empilhador/dashboard",
          },
        ]}
      />
    </div>
  );
}

export { PanelPageTitle as FieldStaffPageTitle } from "@/components/brand/PanelShellHeader";
