import * as React from "react";
import { cn } from "@/lib/utils";

export const Input = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement>
>(({ className, ...props }, ref) => (
  <input
    ref={ref}
    className={cn(
      "flex h-11 w-full rounded-xl border border-white/10 bg-white/5 px-4 text-sm text-stone-100 placeholder:text-stone-500 outline-none transition focus:border-amber-500/50 focus:ring-2 focus:ring-amber-500/20",
      className,
    )}
    {...props}
  />
));
Input.displayName = "Input";
