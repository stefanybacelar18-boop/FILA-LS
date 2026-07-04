import Image from "next/image";
import { cn } from "@/lib/utils";

/** Ícone recortado do PNG oficial — apenas o símbolo, sem fundo branco externo */
export const LOGO_MARK_SRC = "/logo-mark.png";

type BrandLogoSize = "xs" | "sm" | "md" | "lg" | "xl";

const sizes: Record<BrandLogoSize, { mark: number; title: string; gap: string }> = {
  xs: { mark: 28, title: "text-xs", gap: "gap-2" },
  sm: { mark: 32, title: "text-sm", gap: "gap-2.5" },
  md: { mark: 40, title: "text-base", gap: "gap-3" },
  lg: { mark: 56, title: "text-xl", gap: "gap-3" },
  xl: { mark: 72, title: "text-2xl", gap: "gap-3.5" },
};

export function BrandWordmark({
  size,
  inverted,
  className,
}: {
  size: BrandLogoSize;
  inverted: boolean;
  className?: string;
}) {
  const s = sizes[size];

  return (
    <span className={cn("font-bold tracking-tight", s.title, className)}>
      <span className={inverted ? "text-white" : "text-brand-dark"}>Fila</span>
      <span className={inverted ? "text-sky-300" : "text-brand"}>Dock</span>
    </span>
  );
}

function BrandMark({ size, className }: { size: number; className?: string }) {
  return (
    <Image
      src={LOGO_MARK_SRC}
      alt=""
      width={size}
      height={size}
      className={cn("shrink-0 rounded-[22%]", className)}
      priority
    />
  );
}

export function BrandLogo({
  size = "sm",
  showWordmark = true,
  className,
  inverted = false,
  markOnly = false,
}: {
  size?: BrandLogoSize;
  showWordmark?: boolean;
  className?: string;
  inverted?: boolean;
  markOnly?: boolean;
}) {
  const s = sizes[size];

  if (markOnly || !showWordmark) {
    return (
      <div className={cn("inline-flex", className)}>
        <BrandMark size={s.mark} />
      </div>
    );
  }

  return (
    <div className={cn("flex items-center", s.gap, className)}>
      <BrandMark size={s.mark} />
      <BrandWordmark size={size} inverted={inverted} />
    </div>
  );
}
