import { BrandLogo } from "@/components/brand/BrandLogo";
import { cn } from "@/lib/utils";

/** Logomarca centralizada — páginas de entrada e login */
export function BrandLogoHero({
  inverted = false,
  subtitle,
  subtitleClassName,
  className,
}: {
  inverted?: boolean;
  subtitle?: string;
  subtitleClassName?: string;
  className?: string;
}) {
  return (
    <header className={cn("flex w-full flex-col items-center text-center", className)}>
      <BrandLogo size="auth" variant="stacked" inverted={inverted} />
      {subtitle && (
        <p className={cn("mt-6 text-sm font-medium tracking-wide", subtitleClassName)}>
          {subtitle}
        </p>
      )}
    </header>
  );
}

/** Largura única da coluna — logo, cards e formulários alinhados */
export const ENTRY_COLUMN_CLASS = "w-full max-w-sm";
