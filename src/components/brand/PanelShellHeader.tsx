"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { BrandLogo } from "@/components/brand/BrandLogo";
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
          ? "border-slate-800 bg-slate-900/90"
          : "border-slate-200/70 bg-white/95 shadow-[0_1px_0_rgb(15_23_42/0.03)]",
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
            "border-t border-slate-100/80",
            dark ? "px-6 pb-3 pt-2 lg:px-8" : cn(containerClass, "pb-3 pt-2")
          )}
        >
          {below}
        </div>
      )}
    </header>
  );
}

/** Título de página interno — clean, sem competir com a logomarca do header */
export function PanelPageTitle({
  eyebrow,
  title,
  subtitle,
  className,
}: {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  className?: string;
}) {
  return (
    <header className={cn("mb-5", className)}>
      {eyebrow && <p className="section-eyebrow">{eyebrow}</p>}
      <h1 className="text-xl font-bold tracking-tight text-slate-900">{title}</h1>
      {subtitle && <p className="mt-0.5 text-sm leading-snug text-slate-500">{subtitle}</p>}
    </header>
  );
}
