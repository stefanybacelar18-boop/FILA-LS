"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  CalendarDays,
  CheckCircle2,
  Gift,
  Scissors,
  Users,
  XCircle,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type {
  Appointment,
  Barber,
  Barbershop,
  LoyaltyAccount,
  Service,
} from "@/lib/types";
import { formatBRL, formatPhoneBR } from "@/lib/utils";

type DashboardPayload = {
  shop: Barbershop;
  barbers: Barber[];
  services: Service[];
  todayCount: number;
  confirmedCount: number;
  completedCount: number;
  loyaltyClients: number;
  appointments: Appointment[];
};

export function AdminDashboard({ slug }: { slug: string }) {
  const [data, setData] = useState<DashboardPayload | null>(null);
  const [loyalty, setLoyalty] = useState<LoyaltyAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"agenda" | "fidelidade">("agenda");

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      const [dashRes, loyaltyRes] = await Promise.all([
        fetch(`/api/dashboard?slug=${slug}`),
        fetch(`/api/loyalty?slug=${slug}`),
      ]);
      const dash = await dashRes.json();
      const loy = await loyaltyRes.json();
      if (cancelled) return;
      setData(dash);
      setLoyalty(loy.accounts ?? []);
      setLoading(false);
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [slug]);

  async function reload() {
    setLoading(true);
    const [dashRes, loyaltyRes] = await Promise.all([
      fetch(`/api/dashboard?slug=${slug}`),
      fetch(`/api/loyalty?slug=${slug}`),
    ]);
    const dash = await dashRes.json();
    const loy = await loyaltyRes.json();
    setData(dash);
    setLoyalty(loy.accounts ?? []);
    setLoading(false);
  }

  const barberMap = useMemo(() => {
    const map = new Map<string, Barber>();
    data?.barbers.forEach((b) => map.set(b.id, b));
    return map;
  }, [data]);

  const serviceMap = useMemo(() => {
    const map = new Map<string, Service>();
    data?.services.forEach((s) => map.set(s.id, s));
    return map;
  }, [data]);

  async function setStatus(id: string, status: Appointment["status"]) {
    await fetch("/api/appointments", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, status }),
    });
    await reload();
  }

  if (loading || !data) {
    return (
      <div className="mx-auto max-w-6xl px-5 py-16 text-stone-400">
        Carregando painel…
      </div>
    );
  }

  return (
    <main className="mx-auto min-h-screen max-w-6xl px-4 pb-16 pt-6 sm:px-6">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.22em] text-amber-400/80">
            Cortely Admin · Demo
          </p>
          <h1 className="mt-1 font-display text-3xl text-stone-50">
            {data.shop.name}
          </h1>
        </div>
        <div className="flex gap-2">
          <Link href={`/b/${slug}`}>
            <Button variant="outline" size="sm">
              Ver página do cliente
            </Button>
          </Link>
          <Link href="/">
            <Button variant="secondary" size="sm">
              Início
            </Button>
          </Link>
        </div>
      </header>

      <section className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          {
            label: "Hoje",
            value: data.todayCount,
            icon: CalendarDays,
          },
          {
            label: "Confirmados",
            value: data.confirmedCount,
            icon: Scissors,
          },
          {
            label: "Concluídos",
            value: data.completedCount,
            icon: CheckCircle2,
          },
          {
            label: "Clientes fiéis",
            value: data.loyaltyClients,
            icon: Gift,
          },
        ].map((card) => (
          <div key={card.label} className="glass-panel rounded-2xl p-5">
            <div className="flex items-center justify-between">
              <p className="text-sm text-stone-400">{card.label}</p>
              <card.icon className="h-4 w-4 text-amber-400" />
            </div>
            <p className="mt-3 font-display text-3xl text-stone-50">{card.value}</p>
          </div>
        ))}
      </section>

      <div className="mt-8 flex gap-2">
        <Button
          variant={tab === "agenda" ? "default" : "secondary"}
          size="sm"
          onClick={() => setTab("agenda")}
        >
          Agenda
        </Button>
        <Button
          variant={tab === "fidelidade" ? "default" : "secondary"}
          size="sm"
          onClick={() => setTab("fidelidade")}
        >
          Barber Points
        </Button>
      </div>

      {tab === "agenda" ? (
        <section className="mt-4 space-y-3">
          {data.appointments.length === 0 && (
            <div className="glass-panel rounded-2xl p-8 text-center text-stone-400">
              Nenhum agendamento ainda. Use a página do cliente para criar o
              primeiro.
            </div>
          )}
          {data.appointments.map((item) => {
            const barber = barberMap.get(item.barber_id);
            const service = serviceMap.get(item.service_id);
            return (
              <article
                key={item.id}
                className="glass-panel flex flex-col gap-4 rounded-2xl p-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-medium text-stone-100">
                      {item.client_name}
                    </h3>
                    <Badge
                      className={
                        item.status === "completed"
                          ? "border-emerald-500/30 text-emerald-300"
                          : item.status === "canceled"
                            ? "border-rose-500/30 text-rose-300"
                            : "border-amber-500/30 text-amber-300"
                      }
                    >
                      {item.status}
                    </Badge>
                  </div>
                  <p className="mt-1 text-sm text-stone-400">
                    {new Date(`${item.appointment_date}T12:00:00`).toLocaleDateString(
                      "pt-BR",
                    )}{" "}
                    · {item.start_time.slice(0, 5)} · {barber?.name} ·{" "}
                    {service?.name} · {service ? formatBRL(service.price) : "—"}
                  </p>
                  <p className="mt-1 text-xs text-stone-500">
                    {formatPhoneBR(item.client_phone)}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {item.status === "confirmed" && (
                    <>
                      <Button
                        size="sm"
                        onClick={() => setStatus(item.id, "completed")}
                      >
                        <CheckCircle2 className="h-4 w-4" />
                        Concluir + ponto
                      </Button>
                      <Button
                        size="sm"
                        variant="danger"
                        onClick={() => setStatus(item.id, "canceled")}
                      >
                        <XCircle className="h-4 w-4" />
                        Cancelar
                      </Button>
                    </>
                  )}
                </div>
              </article>
            );
          })}
        </section>
      ) : (
        <section className="mt-4 space-y-3">
          <div className="glass-panel rounded-2xl p-5 text-sm text-stone-300">
            Meta: <strong>{data.shop.loyalty_threshold}</strong> cortes →{" "}
            {data.shop.loyalty_reward}. Ao concluir um atendimento, o ponto é
            creditado automaticamente.
          </div>
          {loyalty.length === 0 && (
            <div className="glass-panel rounded-2xl p-8 text-center text-stone-400">
              Ainda sem clientes no programa. Conclua um agendamento para gerar o
              primeiro ponto.
            </div>
          )}
          {loyalty.map((account) => (
            <article
              key={account.id}
              className="glass-panel flex items-center justify-between rounded-2xl p-4"
            >
              <div>
                <p className="font-medium text-stone-100">
                  {account.client_name || "Cliente"}
                </p>
                <p className="text-sm text-stone-400">
                  {formatPhoneBR(account.client_phone)} · {account.total_visits}{" "}
                  visitas
                </p>
              </div>
              <div className="text-right">
                <p className="font-display text-2xl text-amber-300">
                  {account.points}/{data.shop.loyalty_threshold}
                </p>
                <p className="text-xs text-stone-500">pontos atuais</p>
              </div>
            </article>
          ))}
        </section>
      )}

      <section className="mt-10 grid gap-4 md:grid-cols-2">
        <div className="glass-panel rounded-2xl p-5">
          <div className="mb-3 flex items-center gap-2 text-stone-300">
            <Users className="h-4 w-4 text-amber-400" />
            Equipe
          </div>
          <ul className="space-y-2 text-sm text-stone-400">
            {data.barbers.map((b) => (
              <li key={b.id}>
                {b.name} — {b.specialties.join(", ")}
              </li>
            ))}
          </ul>
        </div>
        <div className="glass-panel rounded-2xl p-5">
          <div className="mb-3 flex items-center gap-2 text-stone-300">
            <Scissors className="h-4 w-4 text-amber-400" />
            Serviços
          </div>
          <ul className="space-y-2 text-sm text-stone-400">
            {data.services.map((s) => (
              <li key={s.id} className="flex justify-between gap-3">
                <span>
                  {s.name} · {s.duration_minutes} min
                </span>
                <span className="text-amber-300">{formatBRL(s.price)}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>
    </main>
  );
}
