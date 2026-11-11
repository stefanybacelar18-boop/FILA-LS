"use client";

import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { Appointment, Barber, Service } from "@/lib/types";

type View = "day" | "week" | "month";

function startOfWeek(d: Date) {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const day = x.getDay();
  x.setDate(x.getDate() - day);
  x.setHours(12, 0, 0, 0);
  return x;
}

/** Data local YYYY-MM-DD (evita bug de fuso do toISOString). */
function toISODate(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function atNoon(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 12, 0, 0, 0);
}

export function AdminCalendar({
  appointments,
  barbers,
  services,
  onSelect,
}: {
  appointments: Appointment[];
  barbers: Barber[];
  services: Service[];
  onSelect?: (appointment: Appointment) => void;
}) {
  const [view, setView] = useState<View>("week");
  const [cursor, setCursor] = useState(() => atNoon(new Date()));

  const days = useMemo(() => {
    if (view === "day") return [atNoon(cursor)];
    if (view === "week") {
      const start = startOfWeek(cursor);
      return Array.from({ length: 7 }, (_, i) => {
        const d = new Date(start);
        d.setDate(start.getDate() + i);
        return d;
      });
    }
    const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1, 12);
    const start = startOfWeek(first);
    return Array.from({ length: 42 }, (_, i) => {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      return d;
    });
  }, [view, cursor]);

  function shift(delta: number) {
    const d = atNoon(cursor);
    if (view === "day") d.setDate(d.getDate() + delta);
    else if (view === "week") d.setDate(d.getDate() + delta * 7);
    else d.setMonth(d.getMonth() + delta);
    setCursor(atNoon(d));
  }

  const hours = Array.from({ length: 11 }, (_, i) => i + 9); // 09–19

  function itemsForDay(iso: string) {
    return appointments.filter(
      (a) => a.appointment_date === iso && a.status !== "canceled",
    );
  }

  function renderAppointmentCard(a: Appointment) {
    const barber = barbers.find((b) => b.id === a.barber_id);
    const service = services.find((s) => s.id === a.service_id);
    return (
      <button
        key={a.id}
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onSelect?.(a);
        }}
        className="mb-1 w-full rounded-md bg-amber-500/15 px-1.5 py-1 text-left"
      >
        <p className="truncate text-[11px] font-medium text-amber-100">
          {a.start_time.slice(0, 5)} {a.client_name}
        </p>
        <p className="truncate text-[10px] text-stone-400">
          {service?.name} · {barber?.name}
        </p>
        <Badge className="mt-0.5 scale-90">{a.status}</Badge>
      </button>
    );
  }

  return (
    <div className="glass-panel space-y-4 rounded-2xl p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-2">
          {(["day", "week", "month"] as View[]).map((v) => (
            <Button
              key={v}
              size="sm"
              variant={view === v ? "default" : "secondary"}
              onClick={() => setView(v)}
            >
              {v === "day" ? "Dia" : v === "week" ? "Semana" : "Mês"}
            </Button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="ghost" onClick={() => shift(-1)}>
            ←
          </Button>
          <p className="min-w-[160px] text-center text-sm text-stone-300">
            {cursor.toLocaleDateString("pt-BR", {
              month: "long",
              year: "numeric",
              ...(view === "day" ? { day: "2-digit", weekday: "short" } : {}),
            })}
          </p>
          <Button size="sm" variant="ghost" onClick={() => shift(1)}>
            →
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setCursor(atNoon(new Date()))}
          >
            Hoje
          </Button>
        </div>
      </div>

      {view === "month" ? (
        <div className="grid grid-cols-7 gap-1">
          {["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"].map((d) => (
            <div key={d} className="p-2 text-center text-xs text-stone-500">
              {d}
            </div>
          ))}
          {days.map((day) => {
            const iso = toISODate(day);
            const items = itemsForDay(iso);
            const inMonth = day.getMonth() === cursor.getMonth();
            return (
              <button
                key={iso + String(day.getMonth())}
                type="button"
                onClick={() => {
                  setCursor(atNoon(day));
                  setView("day");
                }}
                className={`min-h-[96px] rounded-xl border border-white/5 p-2 text-left ${
                  inMonth ? "bg-white/[0.03]" : "opacity-40"
                }`}
              >
                <p className="text-xs text-stone-400">{day.getDate()}</p>
                <div className="mt-1 space-y-0.5">
                  {items.slice(0, 3).map((a) => (
                    <p
                      key={a.id}
                      className="truncate text-[10px] font-medium text-amber-100"
                      title={`${a.start_time.slice(0, 5)} ${a.client_name}`}
                    >
                      {a.start_time.slice(0, 5)} {a.client_name}
                    </p>
                  ))}
                  {items.length > 3 && (
                    <p className="text-[10px] text-stone-500">
                      +{items.length - 3} mais
                    </p>
                  )}
                  {items.length === 0 && (
                    <p className="text-[10px] text-stone-600">—</p>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <div
            className="grid min-w-[720px] gap-2"
            style={{
              gridTemplateColumns: `64px repeat(${days.length}, minmax(120px, 1fr))`,
            }}
          >
            <div />
            {days.map((day) => (
              <div
                key={toISODate(day)}
                className="text-center text-xs text-stone-400"
              >
                {day.toLocaleDateString("pt-BR", {
                  weekday: "short",
                  day: "2-digit",
                })}
              </div>
            ))}
            {hours.map((hour) => (
              <div key={hour} className="contents">
                <div className="py-3 text-right text-xs text-stone-500">
                  {String(hour).padStart(2, "0")}:00
                </div>
                {days.map((day) => {
                  const iso = toISODate(day);
                  const items = itemsForDay(iso).filter((a) => {
                    const h = Number(a.start_time.slice(0, 2));
                    return h === hour;
                  });
                  return (
                    <div
                      key={`${iso}-${hour}`}
                      className="min-h-[56px] rounded-lg border border-white/5 bg-white/[0.02] p-1"
                    >
                      {items.map((a) => renderAppointmentCard(a))}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
