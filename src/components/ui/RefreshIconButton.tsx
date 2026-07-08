"use client";

import { useState } from "react";
import { RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";

type RefreshIconButtonProps = {
  onRefresh: () => void | Promise<void>;
  label?: string;
  className?: string;
};

/** Botão de atualizar com feedback visual (spin). */
export function RefreshIconButton({
  onRefresh,
  label = "Atualizar",
  className,
}: RefreshIconButtonProps) {
  const [spinning, setSpinning] = useState(false);

  async function handleClick() {
    if (spinning) return;
    setSpinning(true);
    try {
      await onRefresh();
    } finally {
      setSpinning(false);
    }
  }

  return (
    <button
      type="button"
      onClick={() => void handleClick()}
      disabled={spinning}
      className={cn(
        "inline-flex h-10 w-10 items-center justify-center rounded-xl text-brand transition",
        "hover:bg-brand-muted/80 active:scale-95 disabled:opacity-60",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/25",
        className
      )}
      aria-label={label}
    >
      <RefreshCw className={cn("h-5 w-5", spinning && "animate-spin")} />
    </button>
  );
}
