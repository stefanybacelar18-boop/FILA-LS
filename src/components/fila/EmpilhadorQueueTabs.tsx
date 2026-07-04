import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

export type EmpilhadorTabId = "ativas" | "finalizadas" | "ausentes";

type EmpilhadorQueueTabsProps = {
  value: EmpilhadorTabId;
  onChange: (value: EmpilhadorTabId) => void;
  tabs: { id: EmpilhadorTabId; label: string; icon: LucideIcon }[];
  className?: string;
};

export function EmpilhadorQueueTabs({
  value,
  onChange,
  tabs,
  className,
}: EmpilhadorQueueTabsProps) {
  return (
    <div
      className={cn("flex border-b border-slate-200", className)}
      role="tablist"
      aria-label="Filtrar fila"
    >
      {tabs.map(({ id, label, icon: Icon }) => {
        const active = value === id;
        return (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(id)}
            className={cn(
              "flex flex-1 items-center justify-center gap-1.5 border-b-2 px-2 py-3 text-xs font-semibold transition",
              active
                ? "border-brand text-brand"
                : "border-transparent text-slate-500 hover:text-slate-700"
            )}
          >
            <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden />
            {label}
          </button>
        );
      })}
    </div>
  );
}
