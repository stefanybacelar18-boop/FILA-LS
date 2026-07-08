import { cn } from "@/lib/utils";

/** Cabeçalho de página padronizado — admin, mobile e público */
export function PageHeader({
  eyebrow,
  title,
  subtitle,
  description,
  className,
  children,
}: {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  description?: string;
  className?: string;
  children?: React.ReactNode;
}) {
  const desc = description ?? subtitle;

  return (
    <header
      className={cn(
        "page-header mb-6 flex flex-col gap-4 lg:mb-7 lg:flex-row lg:items-start lg:justify-between",
        className
      )}
    >
      <div className="min-w-0">
        {eyebrow && <p className="section-eyebrow">{eyebrow}</p>}
        <h1 className="page-title">{title}</h1>
        {desc && <p className="page-subtitle">{desc}</p>}
      </div>
      {children && (
        <div className="flex shrink-0 flex-wrap items-center gap-2">{children}</div>
      )}
    </header>
  );
}

/** Destaque de status — sucesso, aviso, erro */
export function StatusBanner({
  tone,
  title,
  description,
  icon,
  className,
}: {
  tone: "success" | "warning" | "brand";
  title: string;
  description?: string;
  icon?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "status-banner text-center",
        tone === "success" && "status-banner--success",
        tone === "warning" && "status-banner--warning",
        tone === "brand" && "status-banner--brand",
        className
      )}
    >
      {icon && <div className="status-banner__icon">{icon}</div>}
      <h2 className="status-banner__title">{title}</h2>
      {description && <p className="status-banner__desc">{description}</p>}
    </div>
  );
}

/** Card de posição na fila — motorista */
export function QueuePositionHero({
  label,
  value,
  detail,
  trailing,
  footer,
  className,
}: {
  label: string;
  value: React.ReactNode;
  detail?: string;
  trailing?: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("queue-position-hero", className)} aria-live="polite">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="queue-position-hero__label">{label}</p>
          <p className="queue-position-hero__value">{value}</p>
          {detail && <p className="queue-position-hero__detail">{detail}</p>}
        </div>
        {trailing}
      </div>
      {footer && <div className="queue-position-hero__footer">{footer}</div>}
    </div>
  );
}
