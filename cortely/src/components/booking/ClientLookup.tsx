"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { Appointment, Barber, LoyaltyAccount, Service } from "@/lib/types";
import { formatBRL, formatPhoneBR, onlyDigits } from "@/lib/utils";

export function ClientLookup({ slug }: { slug: string }) {
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loyalty, setLoyalty] = useState<LoyaltyAccount | null>(null);
  const [barbers, setBarbers] = useState<Barber[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [threshold, setThreshold] = useState(5);
  const [reward, setReward] = useState("");
  const [cancelHours, setCancelHours] = useState(2);
  const [packagesInfo, setPackagesInfo] = useState<string[]>([]);
  const [rating, setRating] = useState(5);
  const [otpSent, setOtpSent] = useState(false);
  const [otpCode, setOtpCode] = useState("");
  const [clientToken, setClientToken] = useState<string | null>(null);
  const [depositMsg, setDepositMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [searched, setSearched] = useState(false);
  const [rescheduleId, setRescheduleId] = useState<string | null>(null);
  const [newDate, setNewDate] = useState("");
  const [newTime, setNewTime] = useState("");
  const [slots, setSlots] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  const minDate = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const verified = Boolean(clientToken);

  async function lookup(token = clientToken) {
    if (!token) {
      setError("Verifique o WhatsApp com OTP antes de consultar");
      return;
    }
    setLoading(true);
    setError(null);
    setSearched(true);
    try {
      const res = await fetch(
        `/api/client-lookup?slug=${slug}&phone=${onlyDigits(phone)}`,
        { headers: { "x-cortely-client": token } },
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Falha na consulta");
      setAppointments(data.appointments ?? []);
      setLoyalty(data.loyalty);
      setBarbers(data.barbers ?? []);
      setServices(data.services ?? []);
      setThreshold(data.threshold ?? 5);
      setReward(data.reward ?? "");
      setCancelHours(data.cancelHoursBefore ?? 2);
      const pkgLines = [
        ...(data.clientPackages ?? []).map(
          (p: { credits_left: number; credits_total: number; status: string }) =>
            `Pacote ${p.credits_left}/${p.credits_total} · ${p.status}`,
        ),
        ...(data.subscriptions ?? []).map(
          (s: { status: string }) => `Assinatura ${s.status}`,
        ),
        ...(data.packages ?? []).map(
          (p: { name: string; price: number; credits: number }) =>
            `Disponível: ${p.name} (${p.credits} créditos)`,
        ),
      ];
      setPackagesInfo(pkgLines);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro");
    } finally {
      setLoading(false);
    }
  }

  async function cancelAppointment(id: string) {
    if (!clientToken) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/appointments", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "client_cancel",
          id,
          phone: onlyDigits(phone),
          client_token: clientToken,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Falha ao cancelar");
      await lookup();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro");
    } finally {
      setBusy(false);
    }
  }

  async function loadSlots(item: Appointment) {
    setRescheduleId(item.id);
    setNewDate(item.appointment_date);
    setNewTime("");
    setSlots([]);
    const res = await fetch(
      `/api/availability?slug=${slug}&barberId=${item.barber_id}&serviceId=${item.service_id}&date=${item.appointment_date}`,
    );
    const data = await res.json();
    setSlots(data.slots ?? []);
  }

  async function loadSlotsForDate(item: Appointment, date: string) {
    setNewDate(date);
    setNewTime("");
    const res = await fetch(
      `/api/availability?slug=${slug}&barberId=${item.barber_id}&serviceId=${item.service_id}&date=${date}`,
    );
    const data = await res.json();
    setSlots(data.slots ?? []);
  }

  async function confirmReschedule(item: Appointment) {
    if (!newDate || !newTime || !clientToken) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/appointments", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "client_reschedule",
          id: item.id,
          phone: onlyDigits(phone),
          client_token: clientToken,
          appointment_date: newDate,
          start_time: newTime,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Falha ao reagendar");
      setRescheduleId(null);
      await lookup();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="glass-panel rounded-3xl p-5 sm:p-7">
      <h3 className="font-display text-2xl text-stone-50">Meus horários</h3>
      <p className="mt-2 text-sm text-stone-400">
        Verifique o WhatsApp com OTP. Depois consulte, cancele ou reagende com
        pelo menos {cancelHours}h de antecedência.
      </p>
      <div className="mt-4 flex flex-col gap-3 sm:flex-row">
        <Input
          placeholder="Seu WhatsApp"
          value={phone}
          onChange={(e) => {
            setPhone(formatPhoneBR(e.target.value));
            setClientToken(null);
            setOtpSent(false);
          }}
        />
        <Button
          onClick={() => lookup()}
          disabled={loading || !verified || onlyDigits(phone).length < 10}
        >
          <Search className="h-4 w-4" />
          {loading ? "Buscando…" : "Consultar"}
        </Button>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button
          size="sm"
          variant="secondary"
          disabled={onlyDigits(phone).length < 10}
          onClick={async () => {
            setError(null);
            const res = await fetch("/api/client-otp", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ action: "send", phone: onlyDigits(phone) }),
            });
            const data = await res.json();
            if (!res.ok) {
              setError(data.error || "Falha ao enviar OTP");
              return;
            }
            setOtpSent(true);
          }}
        >
          Receber código OTP
        </Button>
        {otpSent && (
          <>
            <Input
              className="max-w-[140px]"
              placeholder="Código"
              value={otpCode}
              onChange={(e) => setOtpCode(e.target.value)}
            />
            <Button
              size="sm"
              onClick={async () => {
                setError(null);
                const res = await fetch("/api/client-otp", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    action: "verify",
                    phone: onlyDigits(phone),
                    code: otpCode,
                  }),
                });
                const data = await res.json();
                if (!res.ok || !data.token) {
                  setError(data.error || "OTP inválido");
                  return;
                }
                setClientToken(data.token);
                await lookup(data.token);
              }}
            >
              Verificar
            </Button>
          </>
        )}
        {verified && <Badge>Conta verificada</Badge>}
      </div>
      {error && <p className="mt-3 text-sm text-rose-400">{error}</p>}
      {depositMsg && <p className="mt-3 text-sm text-emerald-300">{depositMsg}</p>}

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

          {packagesInfo.length > 0 && (
            <div className="rounded-2xl border border-white/10 p-4 text-sm text-stone-300 space-y-1">
              {packagesInfo.map((line) => (
                <p key={line}>{line}</p>
              ))}
            </div>
          )}

          <div className="rounded-2xl border border-white/10 p-4 space-y-2">
            <p className="text-sm text-stone-300">Avaliar atendimento</p>
            <div className="flex gap-2">
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  type="button"
                  className={`h-9 w-9 rounded-lg text-sm ${
                    rating === n ? "bg-amber-500 text-stone-950" : "bg-white/5"
                  }`}
                  onClick={() => setRating(n)}
                >
                  {n}★
                </button>
              ))}
              <Button
                size="sm"
                variant="secondary"
                disabled={!verified}
                onClick={async () => {
                  await fetch("/api/ops", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      action: "add_review",
                      client_name: appointments[0]?.client_name || "Cliente",
                      client_phone: onlyDigits(phone),
                      client_token: clientToken,
                      rating,
                      comment: "Avaliação pelo portal",
                      appointment_id: appointments[0]?.id ?? null,
                    }),
                  });
                }}
              >
                Enviar
              </Button>
            </div>
          </div>

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

                  {item.status === "confirmed" && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        variant="danger"
                        disabled={busy}
                        onClick={() => cancelAppointment(item.id)}
                      >
                        Cancelar
                      </Button>
                      <Button
                        size="sm"
                        variant="secondary"
                        disabled={busy}
                        onClick={() => loadSlots(item)}
                      >
                        Reagendar
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={busy}
                        onClick={async () => {
                          const price = service?.price ?? 30;
                          const sinal = Math.round(price * 0.3 * 100) / 100;
                          const res = await fetch("/api/payments", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({
                              action: "create_intent",
                              amount: sinal,
                              description: `Sinal ${service?.name ?? "serviço"}`,
                              customer_name: item.client_name,
                              customer_phone: item.client_phone,
                              method: "pix",
                              appointment_id: item.id,
                              client_token: clientToken,
                            }),
                          });
                          const data = await res.json();
                          if (res.ok) {
                            setDepositMsg(
                              `Sinal Pix ${formatBRL(sinal)} · ${data.intent.status} (${data.intent.provider})`,
                            );
                          }
                        }}
                      >
                        Pagar sinal Pix (30%)
                      </Button>
                    </div>
                  )}

                  {rescheduleId === item.id && (
                    <div className="mt-3 space-y-2 rounded-xl border border-white/10 p-3">
                      <Input
                        type="date"
                        min={minDate}
                        value={newDate}
                        onChange={(e) => loadSlotsForDate(item, e.target.value)}
                      />
                      <div className="flex flex-wrap gap-2">
                        {slots.length === 0 && (
                          <p className="text-xs text-stone-500">Sem horários neste dia.</p>
                        )}
                        {slots.map((slot) => (
                          <button
                            key={slot}
                            type="button"
                            onClick={() => setNewTime(slot)}
                            className={`rounded-lg px-3 py-1.5 text-xs ${
                              newTime === slot
                                ? "bg-amber-500 text-stone-950"
                                : "bg-white/5 text-stone-300"
                            }`}
                          >
                            {slot}
                          </button>
                        ))}
                      </div>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          disabled={!newTime || busy}
                          onClick={() => confirmReschedule(item)}
                        >
                          Confirmar novo horário
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setRescheduleId(null)}
                        >
                          Fechar
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
