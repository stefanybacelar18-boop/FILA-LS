"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, Clock, Scissors, Sparkles, UserRound } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { Barber, Barbershop, Service } from "@/lib/types";
import { formatBRL, formatPhoneBR, localISODate, onlyDigits } from "@/lib/utils";

type Props = {
  shop: Barbershop;
  barbers: Barber[];
  services: Service[];
  /** Só exige OTP quando a WhatsApp Business API está configurada. */
  otpRequired?: boolean;
};

type Step = 1 | 2 | 3 | 4;

export function BookingWizard({
  shop,
  barbers,
  services,
  otpRequired = false,
}: Props) {
  const [step, setStep] = useState<Step>(1);
  const [serviceId, setServiceId] = useState<string | null>(null);
  const [barberId, setBarberId] = useState<string | null>(null);
  const [date, setDate] = useState("");
  const [time, setTime] = useState<string | null>(null);
  const [slots, setSlots] = useState<string[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [clientName, setClientName] = useState("");
  const [clientPhone, setClientPhone] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [otpCode, setOtpCode] = useState("");
  const [clientToken, setClientToken] = useState<string | null>(null);
  const [otpBusy, setOtpBusy] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [whatsappUrl, setWhatsappUrl] = useState<string | null>(null);

  const service = useMemo(
    () => services.find((s) => s.id === serviceId) ?? null,
    [services, serviceId],
  );
  const onlineBarbers = useMemo(() => {
    const allowed = shop.booking_barber_ids ?? [];
    const active = barbers.filter((b) => b.is_active);
    if (!allowed.length) return active;
    return active.filter((b) => allowed.includes(b.id));
  }, [barbers, shop.booking_barber_ids]);

  const barber = useMemo(
    () => onlineBarbers.find((b) => b.id === barberId) ?? null,
    [onlineBarbers, barberId],
  );

  const showPrices = shop.booking_show_prices ?? true;
  const groupByCategory = shop.booking_group_by_category ?? false;
  const bookingEnabled = shop.booking_link_enabled ?? true;

  const servicesByCategory = useMemo(() => {
    if (!groupByCategory) return null;
    const map = new Map<string, Service[]>();
    for (const item of services) {
      const key = item.category || "Outros";
      const list = map.get(key) ?? [];
      list.push(item);
      map.set(key, list);
    }
    return Array.from(map.entries());
  }, [services, groupByCategory]);

  const minDate = localISODate();

  useEffect(() => {
    if (!bookingEnabled || !serviceId || !barberId || !date) return;
    let cancelled = false;
    setLoadingSlots(true);
    setTime(null);

    fetch(
      `/api/availability?slug=${shop.slug}&barberId=${barberId}&serviceId=${serviceId}&date=${date}`,
    )
      .then((r) => r.json())
      .then((data) => {
        if (!cancelled) setSlots(data.slots ?? []);
      })
      .catch(() => {
        if (!cancelled) setSlots([]);
      })
      .finally(() => {
        if (!cancelled) setLoadingSlots(false);
      });

    return () => {
      cancelled = true;
    };
  }, [serviceId, barberId, date, shop.slug, bookingEnabled]);

  async function sendOtp() {
    setOtpBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/client-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "send",
          phone: onlyDigits(clientPhone),
          slug: shop.slug,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Falha ao enviar OTP");
      setOtpSent(true);
      setClientToken(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro OTP");
    } finally {
      setOtpBusy(false);
    }
  }

  async function verifyOtp() {
    setOtpBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/client-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "verify",
          phone: onlyDigits(clientPhone),
          code: otpCode,
          slug: shop.slug,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.token) throw new Error(data.error || "OTP inválido");
      setClientToken(data.token);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro OTP");
    } finally {
      setOtpBusy(false);
    }
  }

  async function confirmBooking() {
    if (!serviceId || !barberId || !date || !time) return;
    if (otpRequired && !clientToken) return;
    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch("/api/appointments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slug: shop.slug,
          barber_id: barberId,
          service_id: serviceId,
          client_name: clientName,
          client_phone: onlyDigits(clientPhone),
          appointment_date: date,
          start_time: time,
          ...(clientToken ? { client_token: clientToken } : {}),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Falha ao agendar");
      setWhatsappUrl(data.whatsappUrl);
      setStep(4);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro inesperado");
    } finally {
      setSubmitting(false);
    }
  }

  if (!bookingEnabled) {
    return (
      <div className="glass-panel rounded-3xl p-8 text-center">
        <p className="font-display text-2xl text-stone-50">Agendamento online pausado</p>
        <p className="mt-2 text-sm text-stone-400">
          O link público está desativado. Entre em contato pelo WhatsApp da barbearia.
        </p>
      </div>
    );
  }

  return (
    <div className="glass-panel relative overflow-hidden rounded-3xl p-5 sm:p-7">
      <div className="pointer-events-none absolute inset-0 grain opacity-[0.07]" />

      <div className="relative mb-6 flex items-center justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.22em] text-amber-400/80">
            Agendar em 3 passos
          </p>
          <h2 className="mt-1 font-display text-2xl text-stone-50">
            {step === 4 ? "Pronto!" : "Escolha e confirme"}
          </h2>
        </div>
        <div className="flex gap-2">
          {[1, 2, 3].map((n) => (
            <div
              key={n}
              className={`h-2.5 w-8 rounded-full transition ${
                step >= n ? "bg-amber-500" : "bg-white/10"
              }`}
            />
          ))}
        </div>
      </div>

      {step === 1 && (
        <div className="relative space-y-3 animate-rise">
          <p className="text-sm text-stone-400">1. Serviço</p>
          {(servicesByCategory ?? ([[null, services]] as const)).map(
            ([category, items]) => (
              <div key={category ?? "all"} className="space-y-3">
                {category && (
                  <p className="pt-2 text-xs uppercase tracking-[0.18em] text-amber-400/80">
                    {category}
                  </p>
                )}
                {items.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      setServiceId(item.id);
                      setStep(2);
                    }}
                    className="group flex w-full items-start gap-4 rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-left transition hover:border-amber-500/40 hover:bg-amber-500/5"
                  >
                    {item.gallery_urls[0] ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={item.gallery_urls[0]}
                        alt={item.name}
                        className="h-20 w-24 shrink-0 rounded-xl object-cover"
                      />
                    ) : (
                      <div className="flex h-20 w-24 shrink-0 items-center justify-center rounded-xl bg-white/5">
                        <Scissors className="h-5 w-5 text-amber-400" />
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <span className="font-medium text-stone-100">{item.name}</span>
                          <p className="mt-1 text-sm text-stone-400">{item.description}</p>
                        </div>
                        {showPrices && (
                          <p className="font-display text-xl text-amber-300">
                            {formatBRL(item.price)}
                          </p>
                        )}
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <Badge>
                          <Clock className="mr-1 h-3 w-3" />
                          {item.duration_minutes} min
                        </Badge>
                        {!groupByCategory && (
                          <Badge className="border-amber-500/30 text-amber-300">
                            {item.category}
                          </Badge>
                        )}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            ),
          )}
        </div>
      )}

      {step === 2 && (
        <div className="relative space-y-4 animate-rise">
          <p className="text-sm text-stone-400">2. Barbeiro e horário</p>
          <div className="grid gap-3 sm:grid-cols-3">
            {onlineBarbers.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setBarberId(item.id)}
                className={`rounded-2xl border p-4 text-left transition ${
                  barberId === item.id
                    ? "border-amber-500/50 bg-amber-500/10"
                    : "border-white/10 bg-white/[0.03] hover:border-white/20"
                }`}
              >
                {item.avatar_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={item.avatar_url}
                    alt={item.name}
                    className="mb-3 h-14 w-14 rounded-full object-cover"
                  />
                ) : (
                  <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-amber-500/30 to-stone-800 text-amber-200">
                    <UserRound className="h-5 w-5" />
                  </div>
                )}
                <p className="font-medium text-stone-100">{item.name}</p>
                <p className="mt-1 text-xs text-stone-400">
                  {item.specialties.join(" · ")}
                </p>
              </button>
            ))}
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-2 block text-xs uppercase tracking-wide text-stone-500">
                Data
              </label>
              <Input
                type="date"
                min={minDate}
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </div>
            <div>
              <label className="mb-2 block text-xs uppercase tracking-wide text-stone-500">
                Horários livres
              </label>
              <div className="flex min-h-11 flex-wrap gap-2 rounded-xl border border-white/10 bg-white/5 p-2">
                {!barberId || !date ? (
                  <span className="px-2 text-sm text-stone-500">
                    Selecione barbeiro e data
                  </span>
                ) : loadingSlots ? (
                  <span className="px-2 text-sm text-stone-500">Carregando…</span>
                ) : slots.length === 0 ? (
                  <span className="px-2 text-sm text-stone-500">
                    Sem horários neste dia
                  </span>
                ) : (
                  slots.map((slot) => (
                    <button
                      key={slot}
                      type="button"
                      onClick={() => setTime(slot)}
                      className={`rounded-lg px-3 py-1.5 text-sm transition ${
                        time === slot
                          ? "bg-amber-500 text-stone-950"
                          : "bg-white/5 text-stone-200 hover:bg-white/10"
                      }`}
                    >
                      {slot}
                    </button>
                  ))
                )}
              </div>
            </div>
          </div>

          <div className="flex gap-3 pt-2">
            <Button variant="secondary" onClick={() => setStep(1)}>
              Voltar
            </Button>
            <Button
              className="flex-1"
              disabled={!barberId || !date || !time}
              onClick={() => setStep(3)}
            >
              Continuar
            </Button>
          </div>
        </div>
      )}

      {step === 3 && service && barber && time && (
        <div className="relative space-y-4 animate-rise">
          <p className="text-sm text-stone-400">3. Seus dados</p>
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-sm text-stone-300">
            <p>
              <span className="text-stone-500">Serviço:</span> {service.name} ·{" "}
              {formatBRL(service.price)}
            </p>
            <p className="mt-1">
              <span className="text-stone-500">Barbeiro:</span> {barber.name}
            </p>
            <p className="mt-1">
              <span className="text-stone-500">Quando:</span>{" "}
              {new Date(`${date}T12:00:00`).toLocaleDateString("pt-BR")} às {time}
            </p>
          </div>

          <div className="grid gap-3">
            <Input
              placeholder="Seu nome"
              value={clientName}
              onChange={(e) => setClientName(e.target.value)}
            />
            <Input
              placeholder="WhatsApp (DDD + número)"
              value={clientPhone}
              onChange={(e) => {
                setClientPhone(formatPhoneBR(e.target.value));
                setClientToken(null);
                setOtpSent(false);
              }}
            />
          </div>

          {otpRequired ? (
            <div className="space-y-2 rounded-2xl border border-white/10 p-4">
              <p className="text-xs uppercase tracking-wide text-stone-500">
                Confirmação WhatsApp (OTP)
              </p>
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={otpBusy || onlyDigits(clientPhone).length < 10}
                  onClick={sendOtp}
                >
                  {otpBusy ? "Enviando…" : "Receber código"}
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
                      disabled={otpBusy || !otpCode}
                      onClick={verifyOtp}
                    >
                      Validar
                    </Button>
                  </>
                )}
              </div>
              {clientToken ? (
                <p className="text-xs text-emerald-300">WhatsApp verificado.</p>
              ) : (
                <p className="text-xs text-stone-500">
                  Envie o código e valide antes de confirmar.
                </p>
              )}
            </div>
          ) : (
            <p className="text-xs text-stone-500">
              Confirmação por código WhatsApp fica ativa quando a API estiver
              configurada. Por enquanto basta nome e telefone.
            </p>
          )}

          {error && <p className="text-sm text-rose-400">{error}</p>}

          <div className="flex gap-3 pt-2">
            <Button variant="secondary" onClick={() => setStep(2)}>
              Voltar
            </Button>
            <Button
              className="flex-1 cta-glow"
              disabled={
                submitting ||
                (otpRequired && !clientToken) ||
                clientName.trim().length < 2 ||
                onlyDigits(clientPhone).length < 10
              }
              onClick={confirmBooking}
            >
              {submitting ? "Reservando…" : "Confirmar agendamento"}
            </Button>
          </div>
        </div>
      )}

      {step === 4 && (
        <div className="relative space-y-5 py-4 text-center animate-rise">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-amber-500/15 text-amber-300">
            <Check className="h-8 w-8" />
          </div>
          <div>
            <h3 className="font-display text-3xl text-stone-50">Horário reservado</h3>
            <p className="mt-2 text-stone-400">
              Confirmação pronta no WhatsApp. Com API configurada o Cortely dispara
              sozinho; senão use o botão abaixo. Lembrete fica na fila do painel (
              {shop.reminder_hours_before}h antes). Você também pode cancelar/reagendar
              em Meus horários.
            </p>
          </div>
          <div className="rounded-2xl border border-amber-500/20 bg-amber-500/10 p-4 text-sm text-amber-100">
            <Sparkles className="mx-auto mb-2 h-4 w-4" />
            Barber Points: a cada {shop.loyalty_threshold} cortes,{" "}
            {shop.loyalty_reward.toLowerCase()}.
          </div>
          {whatsappUrl && (
            <a href={whatsappUrl} target="_blank" rel="noreferrer" className="block">
              <Button className="w-full" size="lg">
                Enviar confirmação no WhatsApp
              </Button>
            </a>
          )}
          <Button
            variant="ghost"
            onClick={() => {
              setStep(1);
              setServiceId(null);
              setBarberId(null);
              setDate("");
              setTime(null);
              setClientName("");
              setClientPhone("");
              setWhatsappUrl(null);
            }}
          >
            Fazer outro agendamento
          </Button>
        </div>
      )}
    </div>
  );
}
