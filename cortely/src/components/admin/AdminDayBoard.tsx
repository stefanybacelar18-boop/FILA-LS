"use client";

import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { Appointment, Barber, ScheduleBlock, Service } from "@/lib/types";
import { localISODate, shopTodayISO } from "@/lib/utils";

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
  // Mesmo fuso do card "Hoje" (Brasília), não UTC do servidor.
  const [date, setDate] = useState(() => shopTodayISO());
  const hours = useMemo(
    () => Array.from({ length: 13 }, (_, i) => i + 8), // 08–20
    [],
  );
  const activeBarbers = barbers.filter((b) => b.is_active);
  const barberMap = useMemo(() => {
    const map = new Map(barbers.map((b) => [b.id, b]));
    return map;
  }, [barbers]);

  const dayAppts = useMemo(
    () =>
      appointments
        .filter((a) => a.appointment_date === date && a.status !== "canceled")
        .slice()
        .sort((a, b) => a.start_time.localeCompare(b.start_time)),
    [appointments, date],
  );
  const dayBlocks = blocks.filter((b) => b.block_date === date);

  const upcomingOtherDays = useMemo(() => {
    if (dayAppts.length > 0) return [] as Appointment[];
    return appointments
      .filter((a) => a.status !== "canceled" && a.appointment_date !== date)
      .slice()
      .sort((a, b) =>
        `${a.appointment_date}${a.start_time}`.localeCompare(
          `${b.appointment_date}${b.start_time}`,
        ),
      )
      .slice(0, 8);
  }, [appointments, date, dayAppts.length]);

  function shift(delta: number) {
    const d = new Date(`${date}T12:00:00`);
    d.setDate(d.getDate() + delta);
    setDate(localISODate(d));
  }

  function hourOf(time: string) {
    return Number(time.slice(0, 5).split(":")[0]);
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
          onClick={() => setDate(shopTodayISO())}
        >
          Hoje
        </Button>
        <p className="text-sm text-stone-400">
          {new Date(`${date}T12:00:00`).toLocaleDateString("pt-BR", {
            weekday: "long",
            day: "2-digit",
            month: "long",
          })}
          {" · "}
          <span className="text-amber-300/90">{dayAppts.length} agendamento(s)</span>
        </p>
      </div>

      {dayAppts.length > 0 && (
        <div className="space-y-2">
          {dayAppts.map((a) => {
            const service = services.find((s) => s.id === a.service_id);
            const barber = barberMap.get(a.barber_id);
            return (
              <article
                key={`list-${a.id}`}
                className="glass-panel flex flex-wrap items-center justify-between gap-3 rounded-2xl px-4 py-3"
              >
                <div>
                  <p className="font-medium text-stone-100">
                    {a.start_time.slice(0, 5)} · {a.client_name}
                  </p>
                  <p className="text-sm text-stone-400">
                    {service?.name ?? "Serviço"} · {barber?.name ?? "Profissional"}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge>{a.status === "confirmed" ? "confirmado" : a.status}</Badge>
                  {a.status === "confirmed" && onStatus && (
                    <>
                      <Button size="sm" onClick={() => onStatus(a.id, "completed")}>
                        Concluir
                      </Button>
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => onStatus(a.id, "no_show")}
                      >
                        Faltou
                      </Button>
                    </>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}

      {dayAppts.length === 0 && (
        <div className="glass-panel space-y-3 rounded-2xl p-5">
          <p className="text-sm text-stone-300">
            Nenhum agendamento nesta data. Os feitos pelos clientes aparecem aqui
            quando a data da reserva for a selecionada.
          </p>
          {upcomingOtherDays.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs uppercase tracking-wide text-stone-500">
                Próximos / outros dias
              </p>
              {upcomingOtherDays.map((a) => {
                const service = services.find((s) => s.id === a.service_id);
                const barber = barberMap.get(a.barber_id);
                return (
                  <button
                    key={a.id}
                    type="button"
                    className="flex w-full items-center justify-between rounded-xl border border-white/10 px-3 py-2 text-left text-sm hover:bg-white/5"
                    onClick={() => setDate(a.appointment_date)}
                  >
                    <span className="text-stone-200">
                      {new Date(`${a.appointment_date}T12:00:00`).toLocaleDateString(
                        "pt-BR",
                      )}{" "}
                      {a.start_time.slice(0, 5)} · {a.client_name}
                    </span>
                    <span className="text-xs text-stone-500">
                      {service?.name} · {barber?.name}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

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
                  return hourOf(a.start_time) === hour;
                });
                const blocked = dayBlocks.some((blk) => {
                  if (blk.barber_id !== b.id) return false;
                  const start = hourOf(blk.start_time);
                  const end = hourOf(blk.end_time);
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
                            <Badge className="scale-90">
                              {a.status === "confirmed" ? "confirmado" : a.status}
                            </Badge>
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
