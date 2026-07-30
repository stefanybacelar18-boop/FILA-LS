import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

export type ViagemEtapa = "checkin" | "transito" | "fila";

const ETAPAS: { id: ViagemEtapa; titulo: string; subtitulo: string }[] = [
  { id: "checkin", titulo: "Check-in feito", subtitulo: "Carregamento em Belém" },
  { id: "transito", titulo: "Em viagem", subtitulo: "Indo para o pátio do PAD" },
  { id: "fila", titulo: "Na fila", subtitulo: "Aguardando descarregamento" },
];

const ORDEM: ViagemEtapa[] = ["checkin", "transito", "fila"];

function etapaIndex(etapa: ViagemEtapa): number {
  return ORDEM.indexOf(etapa);
}

type Props = {
  etapaAtual: ViagemEtapa;
  className?: string;
};

/** Linha do tempo visual — fácil de entender para qualquer idade. */
export function ViagemProgressTracker({ etapaAtual, className }: Props) {
  const atualIdx = etapaIndex(etapaAtual);

  return (
    <div
      className={cn("rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200", className)}
      role="list"
      aria-label="Andamento da viagem"
    >
      <p className="mb-4 text-center text-sm font-bold uppercase tracking-wide text-slate-500">
        Andamento da viagem
      </p>

      <ol className="space-y-0">
        {ETAPAS.map((etapa, index) => {
          const idx = etapaIndex(etapa.id);
          const concluida = idx < atualIdx;
          const atual = idx === atualIdx;
          const futura = idx > atualIdx;
          const ultima = index === ETAPAS.length - 1;

          return (
            <li key={etapa.id} role="listitem" className="flex gap-3">
              <div className="flex flex-col items-center">
                <span
                  className={cn(
                    "flex h-11 w-11 shrink-0 items-center justify-center rounded-full border-2 text-sm font-bold transition-colors",
                    concluida && "border-emerald-500 bg-emerald-500 text-white",
                    atual && "border-brand bg-brand text-white shadow-md ring-4 ring-brand/20",
                    futura && "border-slate-200 bg-slate-50 text-slate-400"
                  )}
                  aria-current={atual ? "step" : undefined}
                >
                  {concluida ? (
                    <Check className="h-5 w-5" strokeWidth={3} aria-hidden />
                  ) : (
                    index + 1
                  )}
                </span>
                {!ultima && (
                  <span
                    className={cn(
                      "my-1 w-0.5 flex-1 min-h-[2rem]",
                      concluida ? "bg-emerald-400" : "bg-slate-200"
                    )}
                    aria-hidden
                  />
                )}
              </div>

              <div className={cn("pb-6 pt-2", ultima && "pb-0")}>
                <p
                  className={cn(
                    "text-base font-bold leading-tight",
                    atual && "text-brand",
                    concluida && "text-emerald-800",
                    futura && "text-slate-400"
                  )}
                >
                  {etapa.titulo}
                  {atual && (
                    <span className="ml-2 inline-block rounded-full bg-brand/10 px-2 py-0.5 text-xs font-bold uppercase text-brand">
                      Agora
                    </span>
                  )}
                </p>
                <p
                  className={cn(
                    "mt-0.5 text-sm",
                    atual ? "font-medium text-slate-700" : "text-slate-500",
                    futura && "text-slate-400"
                  )}
                >
                  {etapa.subtitulo}
                </p>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
