import { cn } from "@/lib/utils";
import { ButtonHTMLAttributes, forwardRef } from "react";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "outline" | "ghost" | "danger" | "success";
  size?: "sm" | "md" | "lg";
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "primary", size = "md", ...props }, ref) => {
    const variants = {
      primary:
        "btn-brand active:scale-[0.98] disabled:opacity-50",
      secondary:
        "bg-slate-800 text-white shadow-sm hover:bg-slate-900 hover:shadow-md",
      outline:
        "border border-slate-300/90 bg-white text-slate-700 shadow-sm hover:border-brand/35 hover:bg-slate-50/80",
      ghost: "bg-transparent text-slate-600 hover:bg-slate-100/80",
      danger:
        "bg-red-600 text-white shadow-sm hover:bg-red-700 hover:shadow-md",
      success:
        "bg-emerald-700 text-white shadow-sm hover:bg-emerald-800 hover:shadow-md",
    };

    const sizes = {
      sm: "px-3 py-2 text-sm min-h-[36px] rounded-lg",
      md: "px-4 py-2.5 text-sm min-h-[44px] rounded-xl",
      lg: "px-5 py-3 text-base min-h-[48px] rounded-xl",
    };

    return (
      <button
        ref={ref}
        className={cn(
          "inline-flex items-center justify-center gap-2 font-semibold transition-all duration-150",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/25 focus-visible:ring-offset-2",
          "disabled:cursor-not-allowed disabled:opacity-50",
          variants[variant],
          sizes[size],
          className
        )}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";
