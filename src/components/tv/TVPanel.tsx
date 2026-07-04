"use client";

import { useEffect, useState, useCallback } from "react";
import type { QueueEntry } from "@/lib/types";
import { getNextToCall, getRecentlyCalled, sortQueueEntries } from "@/lib/queue";
import { fetchEnrichedOperationalQueue } from "@/lib/queue-fetch";
import { createClient } from "@/lib/supabase/client";
import { isActiveQueueStatus } from "@/lib/constants";
import { BrandLogo } from "@/components/brand/BrandLogo";
import { maskPlaca } from "@/lib/checkin-rules";
import { formatPrevisaoDate } from "@/lib/utils";
import { Star } from "lucide-react";
import { OPERATIONAL_TIMEZONE } from "@/lib/queue-day";

export function TVPanel() {
  const supabase = createClient();
  const [nextDriver, setNextDriver] = useState<QueueEntry | null>(null);
  const [calledDrivers, setCalledDrivers] = useState<QueueEntry[]>([]);
  const [waitingCount, setWaitingCount] = useState(0);
  const [clock, setClock] = useState("");

  const fetchData = useCallback(async () => {
    const entries = sortQueueEntries(await fetchEnrichedOperationalQueue(supabase));
    setNextDriver(getNextToCall(entries));
    setCalledDrivers(getRecentlyCalled(entries));
    setWaitingCount(entries.filter((e) => isActiveQueueStatus(e.status)).length);
  }, [supabase]);

  useEffect(() => {
    fetchData();
    const interval = setInterval(() => void fetchData(), 12_000);
    return () => clearInterval(interval);
  }, [fetchData]);

  useEffect(() => {
    function updateClock() {
      setClock(
        new Intl.DateTimeFormat("pt-BR", {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
          timeZone: OPERATIONAL_TIMEZONE,
        }).format(new Date())
      );
    }
    updateClock();
    const interval = setInterval(updateClock, 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <header className="flex items-center justify-between border-b border-slate-800 bg-slate-900/80 px-8 py-4 backdrop-blur-sm">
        <BrandLogo size="md" showCompany inverted />
        <div className="text-right">
          <p className="font-mono text-3xl font-bold text-brand-light">{clock}</p>
          <p className="text-sm text-slate-400">{waitingCount} aguardando descarregamento</p>
        </div>
      </header>

      <div className="grid min-h-[calc(100vh-80px)] grid-rows-2 gap-0 lg:grid-cols-2 lg:grid-rows-1">
        <section
          className="flex flex-col items-center justify-center border-b border-slate-700 p-8 lg:border-b-0 lg:border-r"
          aria-live="polite"
          aria-atomic="true"
        >
          <p className="mb-4 text-xl font-medium uppercase tracking-widest text-slate-400">
            Próximo motorista
          </p>

          {nextDriver ? (
            <div className="text-center">
              <p className="text-8xl font-black text-white lg:text-9xl">
                {maskPlaca(nextDriver.placa_cavalo || nextDriver.placa)}
              </p>
              <p className="mt-4 text-3xl font-semibold text-brand-light">
                Minuta {nextDriver.minuta || "—"}
              </p>
              {nextDriver.prioridade && (
                <p className="mt-3 inline-flex items-center gap-2 rounded-full bg-amber-500/20 px-4 py-1 text-lg text-amber-300">
                  <Star className="h-5 w-5" />
                  Prioridade
                </p>
              )}
              {nextDriver.previsao_descarregamento && (
                <p className="mt-2 text-lg text-slate-400">
                  Prev. {formatPrevisaoDate(nextDriver.previsao_descarregamento)}
                </p>
              )}
            </div>
          ) : (
            <p className="text-4xl text-slate-500">Aguardando veículos...</p>
          )}
        </section>

        <section className="p-8">
          <p className="mb-6 text-xl font-medium uppercase tracking-widest text-slate-400">
            Chamados para doca
          </p>

          {calledDrivers.length === 0 ? (
            <p className="text-2xl text-slate-600">Nenhum chamado no momento</p>
          ) : (
            <div className="space-y-4">
              {calledDrivers.map((driver) => (
                <div
                  key={driver.id}
                  className="flex items-center justify-between rounded-2xl bg-slate-800 px-6 py-4"
                >
                  <div>
                    <p className="font-mono text-3xl font-bold">
                      {maskPlaca(driver.placa_cavalo || driver.placa)}
                    </p>
                    <p className="text-lg text-slate-400">Minuta {driver.minuta || "—"}</p>
                  </div>
                  {driver.doca && (
                    <p className="text-4xl font-black text-green-400">{driver.doca}</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
