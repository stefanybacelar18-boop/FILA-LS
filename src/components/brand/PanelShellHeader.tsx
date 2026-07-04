"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { BrandLogo } from "@/components/brand/BrandLogo";
import { PageHeader } from "@/components/ui/PageHeader";
import { cn } from "@/lib/utils";

type PanelShellHeaderProps = {
  trailing?: ReactNode;
  below?: ReactNode;
  leading?: ReactNode;
  tone?: "light" | "dark";
  logoSize?: "xs" | "sm" | "md";
  logoHref?: string | false;
  sticky?: boolean;
  /** admin = largura do painel operacional; default = mobile */
  layout?: "admin" | "default";
  className?: string;
};

/** Cabeçalho padronizado — logomarca sempre visível, visual clean */
export function PanelShellHeader({
  trailing,
  below,
  leading,
  tone = "light",
  logoSize = "sm",
  logoHref = "/",
  sticky = true,
  layout = "default",
  className,
}: PanelShellHeaderProps) {
  const dark = tone === "dark";
  const containerClass = layout === "admin" ? "page-container-admin" : "page-container";

  const defaultLeading =
    logoHref === false ? (
      <BrandLogo size={logoSize} inverted={dark} />
    ) : (
      <Link href={logoHref} className="inline-flex shrink-0">
        <BrandLogo size={logoSize} inverted={dark} />
      </Link>
    );

  return (
    <header
      className={cn(
        sticky && "sticky top-0 z-40",
        "border-b backdrop-blur-lg",
        dark
          ? "border-brand/30 bg-brand-dark/95"
          : "border-brand/10 bg-white/95 shadow-[0_1px_0_rgb(21_101_192/0.06)]",
        className
      )}
    >
      <div
        className={cn(
          "flex items-center justify-between gap-3",
          dark ? "px-6 py-4 lg:px-8" : cn(containerClass, "min-h-12 py-2")
        )}
      >
        <div className="flex min-w-0 flex-1 items-center">{leading ?? defaultLeading}</div>
        {trailing && <div className="flex shrink-0 items-center gap-2">{trailing}</div>}
      </div>
      {below && (
        <div
          className={cn(
            "border-t border-brand/8",
            dark ? "px-6 pb-3 pt-2 lg:px-8" : cn(containerClass, "pb-3 pt-2")
          )}
        >
          {below}
        </div>
      )}
    </header>
  );
}

/** Título de página — alias de PageHeader */
export function PanelPageTitle({
  eyebrow,
  title,
  subtitle,
  className,
  children,
}: {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  className?: string;
  children?: React.ReactNode;
}) {
  return (
    <PageHeader
      eyebrow={eyebrow}
      title={title}
      subtitle={subtitle}
      className={className}
    >
      {children}
    </PageHeader>
  );
}
