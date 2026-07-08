import { cn } from "@/lib/utils";
import { CheckCircle2, ListOrdered } from "lucide-react";

export type EmpilhadorTabId = "aguardando" | "finalizadas";

type EmpilhadorFinalizadasToggleProps = {
  filter: EmpilhadorTabId;
  finalizedCount: number;
  onChange: (value: EmpilhadorTabId) => void;
  className?: string;
};

/** Alterna entre fila ativa e finalizadas — sem aba redundante de aguardando */
export function EmpilhadorFinalizadasToggle({
  filter,
  finalizedCount,
  onChange,
  className,
}: EmpilhadorFinalizadasToggleProps) {
  const onFinalizadas = filter === "finalizadas";

  return (
    <button
      type="button"
      onClick={() => onChange(onFinalizadas ? "aguardando" : "finalizadas")}
      className={cn("empilhador-finalizadas-toggle", className)}
      aria-pressed={onFinalizadas}
    >
      {onFinalizadas ? (
        <>
          <ListOrdered className="h-4 w-4 shrink-0" aria-hidden />
          Voltar à fila
        </>
      ) : (
        <>
          <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden />
          Finalizadas hoje
          <span className="empilhador-finalizadas-toggle__count">{finalizedCount}</span>
        </>
      )}
    </button>
  );
}

/** @deprecated Use EmpilhadorFinalizadasToggle */
export { EmpilhadorFinalizadasToggle as EmpilhadorQueueTabs };
