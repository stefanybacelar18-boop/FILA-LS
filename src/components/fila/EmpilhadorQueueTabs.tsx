import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

export type EmpilhadorTabId = "aguardando" | "finalizadas";

type EmpilhadorQueueTabsProps = {
  value: EmpilhadorTabId;
  onChange: (value: EmpilhadorTabId) => void;
  tabs: { id: EmpilhadorTabId; label: string; icon: LucideIcon }[];
  className?: string;
};

/** Abas segmentadas — padrão mobile alinhado ao motorista */
export function EmpilhadorQueueTabs({
  value,
  onChange,
  tabs,
  className,
}: EmpilhadorQueueTabsProps) {
  return (
    <div
      className={cn("empilhador-segmented-tabs", className)}
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
              "empilhador-segmented-tabs__item",
              active && "empilhador-segmented-tabs__item--active"
            )}
          >
            <Icon className="h-4 w-4 shrink-0" aria-hidden />
            {label}
          </button>
        );
      })}
    </div>
  );
}
