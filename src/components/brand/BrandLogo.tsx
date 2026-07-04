import Image from "next/image";
import { BRANCH_TAGLINE } from "@/lib/constants";
import { cn } from "@/lib/utils";

type BrandLogoSize = "xs" | "sm" | "md" | "lg";

const sizes: Record<BrandLogoSize, { mark: number; title: string; subtitle: string }> = {
  xs: { mark: 28, title: "text-xs", subtitle: "text-[9px]" },
  sm: { mark: 32, title: "text-sm", subtitle: "text-[10px]" },
  md: { mark: 40, title: "text-base", subtitle: "text-xs" },
  lg: { mark: 56, title: "text-xl", subtitle: "text-sm" },
};

function BrandWordmark({
  size,
  inverted,
}: {
  size: BrandLogoSize;
  inverted: boolean;
}) {
  const s = sizes[size];

  return (
    <span className={cn("font-bold tracking-tight", s.title)}>
      <span className={inverted ? "text-white" : "text-brand-dark"}>Fila</span>
      <span className={inverted ? "text-sky-300" : "text-brand"}>Dock</span>
    </span>
  );
}

export function BrandLogo({
  size = "sm",
  showWordmark = true,
  showCompany = false,
  className,
  inverted = false,
}: {
  size?: BrandLogoSize;
  showWordmark?: boolean;
  showCompany?: boolean;
  className?: string;
  inverted?: boolean;
}) {
  const s = sizes[size];

  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <Image
        src="/logo-mark.svg"
        alt="FilaDock"
        width={s.mark}
        height={s.mark}
        className="shrink-0 rounded-lg shadow-sm ring-1 ring-slate-200/60"
        priority
      />
      {showWordmark && (
        <div className="min-w-0 leading-tight">
          <BrandWordmark size={size} inverted={inverted} />
          {showCompany && (
            <span
              className={cn(
                "block font-normal truncate",
                s.subtitle,
                inverted ? "text-white/70" : "text-slate-400"
              )}
            >
              {BRANCH_TAGLINE}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
