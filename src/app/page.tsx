import Link from "next/link";
import { BrandLogo } from "@/components/brand/BrandLogo";
import { Truck, Monitor, ChevronRight, ListOrdered } from "lucide-react";
import { APP_NAME, FILA_DESCARGA_PUBLIC } from "@/lib/constants";

export default function HomePage() {
  return (
    <div className="min-h-screen bg-brand-hero hero-pattern">
      <div className="mx-auto flex min-h-screen max-w-lg flex-col justify-center px-6 py-12">
        <div className="mb-10 text-center">
          <BrandLogo size="lg" variant="stacked" inverted className="mx-auto" />
        </div>

        <div className="space-y-3">
          <Link
            href="/login/motorista"
            className="group flex items-center gap-4 rounded-2xl border border-white/20 bg-white p-5 shadow-[var(--shadow-premium)] transition duration-200 hover:scale-[1.01] hover:shadow-[var(--shadow-elevated)]"
          >
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-brand-muted ring-1 ring-brand/10">
              <Truck className="h-6 w-6 text-brand" />
            </div>
            <div className="min-w-0 flex-1 text-left">
              <p className="font-bold text-slate-900">Motorista</p>
              <p className="text-sm text-slate-500">Google · Check-in · Fila</p>
            </div>
            <ChevronRight className="h-5 w-5 text-slate-300 transition group-hover:text-brand" />
          </Link>

          <Link
            href="/login"
            className="group flex items-center gap-4 rounded-2xl border border-white/15 bg-white/10 p-5 backdrop-blur-md transition duration-200 hover:bg-white/15"
          >
            <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-white/20 bg-white/10">
              <Monitor className="h-6 w-6 text-white" />
            </div>
            <div className="min-w-0 flex-1 text-left">
              <p className="font-bold text-white">Operacional</p>
              <p className="text-sm text-white/80">Empilhador · Administrador</p>
            </div>
            <ChevronRight className="h-5 w-5 text-white/40 transition group-hover:text-white/80" />
          </Link>

          <Link
            href={FILA_DESCARGA_PUBLIC}
            className="group flex items-center gap-4 rounded-2xl border border-white/15 bg-white/5 p-4 backdrop-blur-sm transition duration-200 hover:bg-white/10"
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/15 bg-white/10">
              <ListOrdered className="h-5 w-5 text-white/90" />
            </div>
            <div className="min-w-0 flex-1 text-left">
              <p className="font-semibold text-white/95">Ver fila de descarga</p>
              <p className="text-xs text-white/65">Sem login · somente leitura</p>
            </div>
            <ChevronRight className="h-4 w-4 text-white/35 transition group-hover:text-white/70" />
          </Link>
        </div>

        <p className="mt-10 text-center text-xs leading-relaxed text-white/55">
          Instale o app {APP_NAME} na tela inicial — abre em tela cheia, sem barra do navegador
        </p>
      </div>
    </div>
  );
}
