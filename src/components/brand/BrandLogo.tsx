import Image from "next/image";
import { BRANCH_TAGLINE } from "@/lib/constants";
import { cn } from "@/lib/utils";

export const LOGO_MARK_SRC = "/logo-mark.svg";
export const LOGO_FULL_SRC = "/brand/logo-full.svg";

type BrandLogoSize = "xs" | "sm" | "md" | "lg" | "xl";

const sizes: Record<
  BrandLogoSize,
  { mark: number; title: string; subtitle: string; gap: string }
> = {
  xs: { mark: 28, title: "text-xs", subtitle: "text-[9px]", gap: "gap-2" },
  sm: { mark: 32, title: "text-sm", subtitle: "text-[10px]", gap: "gap-2.5" },
  md: { mark: 40, title: "text-base", subtitle: "text-xs", gap: "gap-3" },
  lg: { mark: 56, title: "text-xl", subtitle: "text-sm", gap: "gap-3" },
  xl: { mark: 72, title: "text-2xl", subtitle: "text-sm", gap: "gap-3.5" },
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

function BrandMark({
  size,
  inverted,
  className,
}: {
  size: number;
  inverted: boolean;
  className?: string;
}) {
  return (
    <Image
      src={LOGO_MARK_SRC}
      alt="FilaDock"
      width={size}
      height={size}
      className={cn(
        "shrink-0 rounded-[22%]",
        inverted
          ? "shadow-md shadow-black/25 ring-1 ring-white/15"
          : "shadow-sm ring-1 ring-slate-200/60",
        className
      )}
      priority
    />
  );
}

export function BrandLogo({
  size = "sm",
  showWordmark = true,
  showCompany = false,
  className,
  inverted = false,
  markOnly = false,
}: {
  size?: BrandLogoSize;
  showWordmark?: boolean;
  showCompany?: boolean;
  className?: string;
  inverted?: boolean;
  /** Apenas o símbolo FD — cards, botões, favicon inline */
  markOnly?: boolean;
}) {
  const s = sizes[size];

  if (markOnly || !showWordmark) {
    return (
      <div className={cn("inline-flex", className)}>
        <BrandMark size={s.mark} inverted={inverted} />
      </div>
    );
  }

  return (
    <div className={cn("flex items-center", s.gap, className)}>
      <BrandMark size={s.mark} inverted={inverted} />
      <div className="min-w-0 leading-tight">
        <BrandWordmark size={size} inverted={inverted} />
        {showCompany && (
          <span
            className={cn(
              "mt-0.5 block truncate font-medium",
              s.subtitle,
              inverted ? "text-white/75" : "text-slate-500"
            )}
          >
            {BRANCH_TAGLINE}
          </span>
        )}
      </div>
    </div>
  );
}

/** Logo completa horizontal — login e materiais de marca */
export function BrandLogoFull({
  className,
  height = 80,
}: {
  className?: string;
  height?: number;
}) {
  const width = Math.round(height * 3.75);

  return (
    <Image
      src={LOGO_FULL_SRC}
      alt="FilaDock — Gestão inteligente de docas"
      width={width}
      height={height}
      className={cn("h-auto w-auto max-w-full", className)}
      priority
    />
  );
}
