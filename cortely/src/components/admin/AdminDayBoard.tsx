"use client";

import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { Appointment, Barber, ScheduleBlock, Service } from "@/lib/types";

function toLocalISO(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Grade do dia por profissional (referência Salon Soft). */
export function AdminDayBoard({
  appointments,
  barbers,
  services,
  blocks,
  onStatus,
}: {
  appointments: Appointment[];
  barbers: Barber[];
  services: Service[];
  blocks: ScheduleBlock[];
  onStatus?: (id: string, status: Appointment["status"]) => void;
}) {
  const [date, setDate] = useState(() => toLocalISO(new Date()));
  const hours = useMemo(
    () => Array.from({ length: 13 }, (_, i) => i + 8), // 08–20
    [],
  );
  const activeBarbers = barbers.filter((b) => b.is_active);

  const dayAppts = appointments.filter(
    (a) => a.appointment_date === date && a.status !== "canceled",
  );
  const dayBlocks = blocks.filter((b) => b.block_date === date);

  function shift(delta: number) {
    const d = new Date(`${date}T12:00:00`);
    d.setDate(d.getDate() + delta);
    setDate(toLocalISO(d));
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="ghost" onClick={() => shift(-1)}>
          ←
        </Button>
        <Input
          type="date"
          className="max-w-[170px]"
          value={date}
          onChange={(e) => setDate(e.target.value)}
        />
        <Button size="sm" variant="ghost" onClick={() => shift(1)}>
          →
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => setDate(toLocalISO(new Date()))}
        >
          Hoje
        </Button>
        <p className="text-sm text-stone-400">
          {new Date(`${date}T12:00:00`).toLocaleDateString("pt-BR", {
            weekday: "long",
            day: "2-digit",
            month: "long",
          })}
        </p>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-white/10">
        <div
          className="grid min-w-[900px]"
          style={{
            gridTemplateColumns: `64px repeat(${Math.max(activeBarbers.length, 1)}, minmax(160px, 1fr))`,
          }}
        >
          <div className="border-b border-white/10 bg-white/[0.03] p-2" />
          {activeBarbers.map((b) => (
            <div
              key={b.id}
              className="border-b border-l border-white/10 bg-white/[0.03] p-3 text-center"
            >
              <p className="text-sm font-semibold text-stone-100">{b.name}</p>
              <p className="text-[10px] uppercase tracking-wide text-stone-500">
                {b.specialties.slice(0, 2).join(" · ") || "Barbeiro"}
              </p>
            </div>
          ))}

          {hours.map((hour) => (
            <div key={hour} className="contents">
              <div className="border-b border-white/5 py-4 pr-2 text-right text-xs text-stone-500">
                {String(hour).padStart(2, "0")}:00
              </div>
              {activeBarbers.map((b) => {
                const items = dayAppts.filter((a) => {
                  if (a.barber_id !== b.id) return false;
                  return Number(a.start_time.slice(0, 2)) === hour;
                });
                const blocked = dayBlocks.some((blk) => {
                  if (blk.barber_id !== b.id) return false;
                  const start = Number(blk.start_time.slice(0, 2));
                  const end = Number(blk.end_time.slice(0, 2));
                  return hour >= start && hour < end;
                });
                return (
                  <div
                    key={`${b.id}-${hour}`}
                    className={`min-h-[64px] border-b border-l border-white/5 p-1.5 ${
                      blocked ? "bg-rose-500/10" : "bg-transparent"
                    }`}
                  >
                    {blocked && items.length === 0 && (
                      <p className="px-1 text-[10px] text-rose-300">Ausência</p>
                    )}
                    {items.map((a) => {
                      const service = services.find((s) => s.id === a.service_id);
                      return (
                        <div
                          key={a.id}
                          className="mb-1 rounded-lg bg-amber-500/20 px-2 py-1.5"
                        >
                          <p className="truncate text-[11px] font-semibold text-amber-50">
                            {a.start_time.slice(0, 5)} {a.client_name}
                          </p>
                          <p className="truncate text-[10px] text-stone-300">
                            {service?.name ?? "Serviço"}
                          </p>
                          <div className="mt-1 flex flex-wrap gap-1">
                            <Badge className="scale-90">{a.status}</Badge>
                            {a.status === "confirmed" && onStatus && (
                              <>
                                <button
                                  type="button"
                                  className="rounded bg-emerald-500/20 px-1.5 text-[10px] text-emerald-200"
                                  onClick={() => onStatus(a.id, "completed")}
                                >
                                  Concluir
                                </button>
                                <button
                                  type="button"
                                  className="rounded bg-white/10 px-1.5 text-[10px] text-stone-300"
                                  onClick={() => onStatus(a.id, "no_show")}
                                >
                                  Faltou
                                </button>
                              </>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
