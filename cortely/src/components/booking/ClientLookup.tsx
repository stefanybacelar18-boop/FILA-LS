"use client";

import { useState } from "react";
import { Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { Appointment, Barber, LoyaltyAccount, Service } from "@/lib/types";
import { formatPhoneBR, onlyDigits } from "@/lib/utils";

export function ClientLookup({ slug }: { slug: string }) {
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loyalty, setLoyalty] = useState<LoyaltyAccount | null>(null);
  const [barbers, setBarbers] = useState<Barber[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [threshold, setThreshold] = useState(5);
  const [reward, setReward] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [searched, setSearched] = useState(false);

  async function lookup() {
    setLoading(true);
    setError(null);
    setSearched(true);
    try {
      const res = await fetch(
        `/api/client-lookup?slug=${slug}&phone=${onlyDigits(phone)}`,
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Falha na consulta");
      setAppointments(data.appointments ?? []);
      setLoyalty(data.loyalty);
      setBarbers(data.barbers ?? []);
      setServices(data.services ?? []);
      setThreshold(data.threshold ?? 5);
      setReward(data.reward ?? "");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="glass-panel rounded-3xl p-5 sm:p-7">
      <h3 className="font-display text-2xl text-stone-50">Meus horários</h3>
      <p className="mt-2 text-sm text-stone-400">
        Consulte seus agendamentos e pontos de fidelidade pelo WhatsApp.
      </p>
      <div className="mt-4 flex flex-col gap-3 sm:flex-row">
        <Input
          placeholder="Seu WhatsApp"
          value={phone}
          onChange={(e) => setPhone(formatPhoneBR(e.target.value))}
        />
        <Button onClick={lookup} disabled={loading || onlyDigits(phone).length < 10}>
          <Search className="h-4 w-4" />
          {loading ? "Buscando…" : "Consultar"}
        </Button>
      </div>
      {error && <p className="mt-3 text-sm text-rose-400">{error}</p>}

      {searched && !error && (
        <div className="mt-5 space-y-3">
          {loyalty ? (
            <div className="rounded-2xl border border-amber-500/20 bg-amber-500/10 p-4 text-sm text-amber-100">
              Barber Points: {loyalty.points}/{threshold} · {reward}
            </div>
          ) : (
            <div className="rounded-2xl border border-white/10 p-4 text-sm text-stone-400">
              Ainda sem pontos neste WhatsApp.
            </div>
          )}

          {appointments.length === 0 ? (
            <p className="text-sm text-stone-500">Nenhum agendamento encontrado.</p>
          ) : (
            appointments.map((item) => {
              const barber = barbers.find((b) => b.id === item.barber_id);
              const service = services.find((s) => s.id === item.service_id);
              return (
                <div
                  key={item.id}
                  className="rounded-2xl border border-white/10 bg-white/[0.03] p-4"
                >
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-stone-100">
                      {service?.name ?? "Serviço"}
                    </p>
                    <Badge>{item.status}</Badge>
                  </div>
                  <p className="mt-1 text-sm text-stone-400">
                    {new Date(`${item.appointment_date}T12:00:00`).toLocaleDateString(
                      "pt-BR",
                    )}{" "}
                    às {item.start_time.slice(0, 5)} · {barber?.name}
                  </p>
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
