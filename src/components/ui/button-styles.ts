import { cn } from "@/lib/utils";

export type ButtonVariant =
  | "primary"
  | "secondary"
  | "outline"
  | "ghost"
  | "danger"
  | "success";

export type ButtonSize = "sm" | "md" | "lg";

const variants: Record<ButtonVariant, string> = {
  primary: "btn-brand active:scale-[0.98] disabled:opacity-50",
  secondary: "bg-slate-800 text-white shadow-sm hover:bg-slate-900 hover:shadow-md",
  outline:
    "border border-brand/15 bg-white text-slate-700 shadow-sm hover:border-brand/30 hover:bg-brand-muted/30",
  ghost: "bg-transparent text-slate-600 hover:bg-brand-muted/50",
  danger: "bg-red-600 text-white shadow-sm hover:bg-red-700 hover:shadow-md",
  success: "bg-emerald-600 text-white shadow-sm hover:bg-emerald-700",
};

const sizes: Record<ButtonSize, string> = {
  sm: "px-3 py-2 text-sm min-h-[36px] rounded-lg",
  md: "px-4 py-2.5 text-sm min-h-[44px] rounded-xl",
  lg: "px-5 py-3 text-base min-h-[48px] rounded-xl",
};

export function buttonClassName({
  variant = "primary",
  size = "md",
  className,
}: {
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
}) {
  return cn(
    "inline-flex items-center justify-center gap-2 font-semibold transition-all duration-150",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/25 focus-visible:ring-offset-2",
    "disabled:cursor-not-allowed disabled:opacity-50",
    variants[variant],
    sizes[size],
    className
  );
}
