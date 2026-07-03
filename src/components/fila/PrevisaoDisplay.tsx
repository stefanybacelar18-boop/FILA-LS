import { Calendar } from "lucide-react";
import { cn, formatPrevisaoDate } from "@/lib/utils";

function hasPrevisaoDescarregamento(previsao: string | null | undefined): boolean {
  return Boolean(previsao?.trim());
}

export function PrevisaoDisplay({
  previsao,
  compact = false,
  automatic = false,
  className,
}: {
  previsao: string | null | undefined;
  compact?: boolean;
  automatic?: boolean;
  className?: string;
}) {
  if (!hasPrevisaoDescarregamento(previsao)) return null;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-lg font-medium",
        automatic ? "bg-sky-100 text-sky-800" : "bg-sky-50 text-sky-900",
        compact ? "px-2 py-0.5 text-[10px]" : "px-2.5 py-1 text-xs",
        className
      )}
    >
      <Calendar className={cn(compact ? "h-3 w-3" : "h-3.5 w-3.5")} />
      <span>
        {compact ? "Prev. " : "Previsão: "}
        {formatPrevisaoDate(previsao!)}
        {automatic && !compact && " (auto)"}
      </span>
    </span>
  );
}
