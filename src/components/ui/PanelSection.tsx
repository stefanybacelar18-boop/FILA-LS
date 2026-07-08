import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

type PanelSectionProps = {
  title: string;
  icon?: LucideIcon;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
};

/** Bloco de conteúdo padronizado — listas e painéis mobile. */
export function PanelSection({
  title,
  icon: Icon,
  description,
  action,
  children,
  className,
}: PanelSectionProps) {
  return (
    <section className={cn("panel-section", className)}>
      <div className="panel-section__head">
        <div className="min-w-0 flex-1">
          <h2 className="panel-section__title">
            {Icon && <Icon className="h-5 w-5 shrink-0 text-brand" aria-hidden />}
            {title}
          </h2>
          {description && <p className="panel-section__desc">{description}</p>}
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>
      <div className="panel-section__body">{children}</div>
    </section>
  );
}
