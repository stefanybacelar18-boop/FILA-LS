"use client";

import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export type MobileNavItem = {
  key: string;
  label: string;
  icon: LucideIcon;
  active: boolean;
  href?: string;
  disabled?: boolean;
  disabledTitle?: string;
  describedBy?: string;
};

/** Barra inferior padronizada — motorista e empilhador (mobile). */
export function MobileBottomNav({ items }: { items: MobileNavItem[] }) {
  return (
    <nav
      className="mobile-bottom-nav safe-bottom"
      aria-label="Navegação principal"
    >
      <div className="page-container mobile-bottom-nav__inner">
        {items.map((item) => {
          const Icon = item.icon;
          const content = (
            <>
              {item.active && (
                <span className="mobile-bottom-nav__indicator" aria-hidden />
              )}
              <span
                className={cn(
                  "mobile-bottom-nav__icon-wrap",
                  item.active && "mobile-bottom-nav__icon-wrap--active"
                )}
              >
                <Icon className={cn("h-5 w-5", item.active && "stroke-[2.25]")} />
              </span>
              <span>{item.label}</span>
            </>
          );

          if (item.disabled || !item.href) {
            return (
              <span
                key={item.key}
                aria-disabled="true"
                aria-describedby={item.describedBy}
                title={item.disabledTitle}
                className="mobile-bottom-nav__item mobile-bottom-nav__item--disabled"
              >
                {content}
              </span>
            );
          }

          return (
            <Link
              key={item.key}
              href={item.href}
              aria-current={item.active ? "page" : undefined}
              className={cn(
                "mobile-bottom-nav__item",
                item.active && "mobile-bottom-nav__item--active"
              )}
            >
              {content}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
