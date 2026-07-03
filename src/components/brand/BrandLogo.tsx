import Image from "next/image";
import { APP_NAME, COMPANY_NAME } from "@/lib/constants";
import { cn } from "@/lib/utils";

type BrandLogoSize = "xs" | "sm" | "md" | "lg";

const sizes: Record<BrandLogoSize, { mark: number; title: string; subtitle: string }> = {
  xs: { mark: 28, title: "text-xs", subtitle: "text-[9px]" },
  sm: { mark: 32, title: "text-sm", subtitle: "text-[10px]" },
  md: { mark: 40, title: "text-base", subtitle: "text-xs" },
  lg: { mark: 56, title: "text-xl", subtitle: "text-sm" },
};

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
        alt=""
        width={s.mark}
        height={s.mark}
        className="shrink-0 rounded-lg ring-1 ring-slate-200/80"
        priority
      />
      {showWordmark && (
        <div className="min-w-0 leading-tight">
          <span
            className={cn(
              "block font-bold tracking-tight",
              s.title,
              inverted ? "text-white" : "text-brand"
            )}
          >
            {APP_NAME}
          </span>
          {showCompany && (
            <span
              className={cn(
                "block font-normal truncate",
                s.subtitle,
                inverted ? "text-white/70" : "text-slate-400"
              )}
            >
              {COMPANY_NAME}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
