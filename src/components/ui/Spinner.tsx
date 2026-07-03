import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

type SpinnerProps = {
  size?: "sm" | "md" | "lg";
  className?: string;
  label?: string;
};

const sizes = {
  sm: "h-4 w-4",
  md: "h-6 w-6",
  lg: "h-8 w-8",
};

/** Indicador de carregamento padronizado (brand). */
export function Spinner({ size = "lg", className, label }: SpinnerProps) {
  const icon = (
    <Loader2
      className={cn("animate-spin text-brand", sizes[size], className)}
      aria-hidden={Boolean(label)}
    />
  );

  if (label) {
    return (
      <div className="flex flex-col items-center gap-2" role="status" aria-live="polite">
        {icon}
        <span className="sr-only">{label}</span>
      </div>
    );
  }

  return icon;
}
