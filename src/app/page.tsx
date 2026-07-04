import Link from "next/link";
import { BrandLogoHero, ENTRY_COLUMN_CLASS } from "@/components/brand/BrandLogoHero";
import { Truck, Monitor, ChevronRight, ListOrdered } from "lucide-react";
import { APP_NAME, FILA_DESCARGA_PUBLIC, SITE_FOOTER_BRAND } from "@/lib/constants";

export default function HomePage() {
  return (
    <div className="min-h-screen bg-brand-hero hero-pattern">
      <div
        className={`mx-auto flex min-h-screen flex-col items-center justify-center px-6 py-12 ${ENTRY_COLUMN_CLASS}`}
      >
        <BrandLogoHero inverted className="mb-10" />

        <div className="w-full space-y-3">
          <Link
            href="/login/motorista"
            className="group flex items-center gap-4 rounded-2xl border border-white/20 bg-white p-5 shadow-[var(--shadow-premium)] transition duration-200 hover:scale-[1.01] hover:shadow-[var(--shadow-elevated)]"
          >
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-brand-muted ring-1 ring-brand/10">
              <Truck className="h-6 w-6 text-brand" />
            </div>
            <p className="min-w-0 flex-1 text-left text-base font-bold uppercase tracking-wide text-slate-900">
              Motorista
            </p>
            <ChevronRight className="h-5 w-5 shrink-0 text-slate-300 transition group-hover:text-brand" />
          </Link>

          <Link
            href="/login"
            className="group flex items-center gap-4 rounded-2xl border border-white/15 bg-white/10 p-5 backdrop-blur-md transition duration-200 hover:bg-white/15"
          >
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-white/20 bg-white/10">
              <Monitor className="h-6 w-6 text-white" />
            </div>
            <p className="min-w-0 flex-1 text-left text-base font-bold uppercase tracking-wide text-white">
              Operacional
            </p>
            <ChevronRight className="h-5 w-5 shrink-0 text-white/40 transition group-hover:text-white/80" />
          </Link>

          <Link
            href={FILA_DESCARGA_PUBLIC}
            className="group flex items-center gap-4 rounded-2xl border border-white/15 bg-white/5 p-5 backdrop-blur-sm transition duration-200 hover:bg-white/10"
          >
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-white/15 bg-white/10">
              <ListOrdered className="h-6 w-6 text-white/90" />
            </div>
            <p className="min-w-0 flex-1 text-left text-base font-bold uppercase tracking-wide text-white/95">
              Acompanhar fila
            </p>
            <ChevronRight className="h-5 w-5 shrink-0 text-white/35 transition group-hover:text-white/70" />
          </Link>
        </div>

        <footer className="mt-10 w-full space-y-1 text-center">
          <p className="text-sm font-semibold tracking-wide text-white/80">
            {APP_NAME} · {SITE_FOOTER_BRAND}
          </p>
          <p className="text-xs leading-relaxed text-white/50">
            Toque em &quot;Adicionar à tela inicial&quot; no navegador
          </p>
        </footer>
      </div>
    </div>
  );
}
