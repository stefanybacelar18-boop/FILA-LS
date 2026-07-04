import { cn } from "@/lib/utils";

export const LOGO_MARK_SRC = "/logo-mark.svg";

type BrandLogoSize = "xs" | "sm" | "md" | "lg" | "xl";
type BrandLogoVariant = "inline" | "stacked";

const sizes: Record<
  BrandLogoSize,
  { mark: number; title: string; gap: string; stackedGap: string }
> = {
  xs: { mark: 28, title: "text-xs", gap: "gap-2", stackedGap: "gap-1.5" },
  sm: { mark: 32, title: "text-sm", gap: "gap-2.5", stackedGap: "gap-2" },
  md: { mark: 48, title: "text-lg", gap: "gap-3", stackedGap: "gap-2.5" },
  lg: { mark: 64, title: "text-xl", gap: "gap-3", stackedGap: "gap-3" },
  xl: { mark: 80, title: "text-2xl", gap: "gap-3.5", stackedGap: "gap-3.5" },
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
    <span
      className={cn(
        "font-bold tracking-tight",
        s.title,
        inverted && "drop-shadow-sm",
        className
      )}
    >
      <span className={inverted ? "text-white" : "text-brand-dark"}>Fila</span>
      <span className={inverted ? "text-sky-300" : "text-brand"}>Dock</span>
    </span>
  );
}

function BrandMark({
  size,
  className,
}: {
  size: number;
  className?: string;
}) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={LOGO_MARK_SRC}
      alt=""
      width={size}
      height={size}
      className={cn("shrink-0 rounded-[22%]", className)}
      draggable={false}
      decoding="async"
    />
  );
}

export function BrandLogo({
  size = "sm",
  variant = "inline",
  showWordmark = true,
  className,
  inverted = false,
  markOnly = false,
}: {
  size?: BrandLogoSize;
  variant?: BrandLogoVariant;
  showWordmark?: boolean;
  className?: string;
  inverted?: boolean;
  markOnly?: boolean;
}) {
  const s = sizes[size];
  const markClass = cn(
    inverted && "shadow-lg shadow-black/20 ring-1 ring-white/10"
  );

  if (markOnly || !showWordmark) {
    return (
      <div className={cn("inline-flex", className)}>
        <BrandMark size={s.mark} className={markClass} />
      </div>
    );
  }

  if (variant === "stacked") {
    return (
      <div className={cn("flex flex-col items-center", s.stackedGap, className)}>
        <BrandMark size={s.mark} className={markClass} />
        <BrandWordmark size={size} inverted={inverted} />
      </div>
    );
  }

  return (
    <div className={cn("flex items-center", s.gap, className)}>
      <BrandMark size={s.mark} className={markClass} />
      <BrandWordmark size={size} inverted={inverted} />
    </div>
  );
}
