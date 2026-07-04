"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { BrandLogo } from "@/components/brand/BrandLogo";
import { cn } from "@/lib/utils";

export function AuthLayout({
  children,
  variant = "light",
  subtitle,
}: {
  children: ReactNode;
  variant?: "light" | "dark";
  subtitle?: string;
}) {
  const dark = variant === "dark";

  return (
    <div
      className={cn(
        "flex min-h-screen flex-col items-center justify-center p-4",
        dark ? "bg-brand-hero hero-pattern" : "app-canvas"
      )}
    >
      <div className="mb-8 text-center">
        <BrandLogo
          size="lg"
          variant="stacked"
          inverted={dark}
          className="mx-auto"
        />
        {subtitle && (
          <p
            className={cn(
              "mt-5 text-sm font-medium tracking-wide",
              dark ? "text-white/75" : "text-slate-500"
            )}
          >
            {subtitle}
          </p>
        )}
      </div>

      <div className="w-full max-w-sm">{children}</div>
    </div>
  );
}

export function AuthCard({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-slate-200/80 bg-white p-6 shadow-[var(--shadow-premium)] ring-1 ring-slate-900/[0.03]",
        className
      )}
    >
      {children}
    </div>
  );
}

export function AuthFooterLink({
  href,
  children,
  dark = false,
}: {
  href: string;
  children: ReactNode;
  dark?: boolean;
}) {
  return (
    <p
      className={cn(
        "mt-6 text-center text-xs",
        dark ? "text-white/65" : "text-slate-400"
      )}
    >
      <Link
        href={href}
        className={cn(
          "font-semibold underline-offset-2 transition hover:underline",
          dark ? "text-white" : "text-brand-light"
        )}
      >
        {children}
      </Link>
    </p>
  );
}
