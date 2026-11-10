"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  CalendarDays,
  CheckCircle2,
  Clock3,
  Gift,
  MessageCircle,
  Scissors,
  Settings2,
  Users,
  XCircle,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type {
  Appointment,
  Barber,
  Barbershop,
  LoyaltyAccount,
  Reminder,
  Service,
  WorkingHours,
} from "@/lib/types";
import { formatBRL, formatPhoneBR } from "@/lib/utils";
import { buildWhatsAppReminderUrl } from "@/lib/whatsapp";

type Tab =
  | "agenda"
  | "servicos"
  | "equipe"
  | "horarios"
  | "lembretes"
  | "fidelidade"
  | "config";

type AdminPayload = {
  shop: Barbershop;
  barbers: Barber[];
  services: Service[];
  workingHours: WorkingHours[];
  todayCount: number;
  confirmedCount: number;
  completedCount: number;
  loyaltyClients: number;
  pendingReminders: number;
  appointments: Appointment[];
  loyalty: LoyaltyAccount[];
  reminders: Reminder[];
};

const DAY_LABELS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

export function AdminDashboard({ slug }: { slug: string }) {
  const [data, setData] = useState<AdminPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>("agenda");
  const [serviceForm, setServiceForm] = useState({
    name: "",
    description: "",
    duration_minutes: 40,
    price: 50,
    category: "Cabelo",
  });
  const [barberForm, setBarberForm] = useState({
    name: "",
    specialties: "",
    avatar_url: "",
  });
  const [hoursBarberId, setHoursBarberId] = useState<string>("");
  const [settings, setSettings] = useState({
    name: "",
    phone: "",
    address: "",
    primary_color: "#d97706",
    loyalty_threshold: 5,
    loyalty_reward: "",
    reminder_hours_before: 24,
  });

  const reload = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/admin?slug=${slug}`);
    const json = await res.json();
    setData(json);
    setSettings({
      name: json.shop.name,
      phone: json.shop.phone,
      address: json.shop.address ?? "",
      primary_color: json.shop.primary_color,
      loyalty_threshold: json.shop.loyalty_threshold,
      loyalty_reward: json.shop.loyalty_reward,
      reminder_hours_before: json.shop.reminder_hours_before ?? 24,
    });
    if (!hoursBarberId && json.barbers?.[0]?.id) {
      setHoursBarberId(json.barbers[0].id);
    }
    setLoading(false);
  }, [slug, hoursBarberId]);

  useEffect(() => {
    reload();
  }, [reload]);

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

  async function adminAction(body: Record<string, unknown>) {
    const res = await fetch("/api/admin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || "Falha na ação");
    await reload();
    return json;
  }

  const selectedHours = useMemo(() => {
    if (!data || !hoursBarberId) return [];
    return data.workingHours.filter((w) => w.barber_id === hoursBarberId);
  }, [data, hoursBarberId]);

  if (loading || !data) {
    return (
      <div className="mx-auto max-w-6xl px-5 py-16 text-stone-400">
        Carregando painel…
      </div>
    );
  }

  const tabs: { id: Tab; label: string }[] = [
    { id: "agenda", label: "Agenda" },
    { id: "servicos", label: "Serviços" },
    { id: "equipe", label: "Equipe" },
    { id: "horarios", label: "Horários" },
    { id: "lembretes", label: "Lembretes" },
    { id: "fidelidade", label: "Barber Points" },
    { id: "config", label: "Config" },
  ];

  return (
    <main className="mx-auto min-h-screen max-w-6xl px-4 pb-16 pt-6 sm:px-6">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.22em] text-amber-400/80">
            Cortely Admin
          </p>
          <h1 className="mt-1 font-display text-3xl text-stone-50">
            {data.shop.name}
          </h1>
        </div>
        <div className="flex gap-2">
          <Link href={`/b/${slug}`}>
            <Button variant="outline" size="sm">
              Página do cliente
            </Button>
          </Link>
          <Link href="/">
            <Button variant="secondary" size="sm">
              Início
            </Button>
          </Link>
        </div>
      </header>

      <section className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {[
          { label: "Hoje", value: data.todayCount, icon: CalendarDays },
          { label: "Confirmados", value: data.confirmedCount, icon: Scissors },
          { label: "Concluídos", value: data.completedCount, icon: CheckCircle2 },
          { label: "Fiéis", value: data.loyaltyClients, icon: Gift },
          {
            label: "Lembretes",
            value: data.pendingReminders,
            icon: MessageCircle,
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

      <div className="mt-8 flex flex-wrap gap-2">
        {tabs.map((item) => (
          <Button
            key={item.id}
            variant={tab === item.id ? "default" : "secondary"}
            size="sm"
            onClick={() => setTab(item.id)}
          >
            {item.label}
          </Button>
        ))}
      </div>

      {tab === "agenda" && (
        <section className="mt-4 space-y-3">
          {data.appointments.length === 0 && (
            <div className="glass-panel rounded-2xl p-8 text-center text-stone-400">
              Nenhum agendamento ainda.
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
                    <h3 className="font-medium text-stone-100">{item.client_name}</h3>
                    <Badge>{item.status}</Badge>
                  </div>
                  <p className="mt-1 text-sm text-stone-400">
                    {new Date(`${item.appointment_date}T12:00:00`).toLocaleDateString(
                      "pt-BR",
                    )}{" "}
                    · {item.start_time.slice(0, 5)} · {barber?.name} · {service?.name}{" "}
                    · {service ? formatBRL(service.price) : "—"}
                  </p>
                  <p className="mt-1 text-xs text-stone-500">
                    {formatPhoneBR(item.client_phone)}
                  </p>
                </div>
                {item.status === "confirmed" && (
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" onClick={() => setStatus(item.id, "completed")}>
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
                  </div>
                )}
              </article>
            );
          })}
        </section>
      )}

      {tab === "servicos" && (
        <section className="mt-4 grid gap-4 lg:grid-cols-[1fr_1.1fr]">
          <div className="glass-panel space-y-3 rounded-2xl p-5">
            <h3 className="font-display text-xl text-stone-50">Novo serviço</h3>
            <Input
              placeholder="Nome"
              value={serviceForm.name}
              onChange={(e) => setServiceForm({ ...serviceForm, name: e.target.value })}
            />
            <Input
              placeholder="Descrição"
              value={serviceForm.description}
              onChange={(e) =>
                setServiceForm({ ...serviceForm, description: e.target.value })
              }
            />
            <div className="grid grid-cols-3 gap-2">
              <Input
                type="number"
                placeholder="Min"
                value={serviceForm.duration_minutes}
                onChange={(e) =>
                  setServiceForm({
                    ...serviceForm,
                    duration_minutes: Number(e.target.value),
                  })
                }
              />
              <Input
                type="number"
                placeholder="Preço"
                value={serviceForm.price}
                onChange={(e) =>
                  setServiceForm({ ...serviceForm, price: Number(e.target.value) })
                }
              />
              <Input
                placeholder="Categoria"
                value={serviceForm.category}
                onChange={(e) =>
                  setServiceForm({ ...serviceForm, category: e.target.value })
                }
              />
            </div>
            <Button
              onClick={async () => {
                await adminAction({ action: "upsert_service", ...serviceForm });
                setServiceForm({
                  name: "",
                  description: "",
                  duration_minutes: 40,
                  price: 50,
                  category: "Cabelo",
                });
              }}
            >
              Salvar serviço
            </Button>
          </div>
          <div className="space-y-3">
            {data.services.map((service) => (
              <article key={service.id} className="glass-panel rounded-2xl p-4">
                <div className="flex gap-3">
                  {service.gallery_urls[0] && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={service.gallery_urls[0]}
                      alt={service.name}
                      className="h-16 w-20 rounded-xl object-cover"
                    />
                  )}
                  <div className="flex-1">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h4 className="font-medium text-stone-100">{service.name}</h4>
                        <p className="text-sm text-stone-400">
                          {service.duration_minutes} min · {formatBRL(service.price)} ·{" "}
                          {service.category}
                        </p>
                      </div>
                      <Button
                        size="sm"
                        variant="danger"
                        onClick={() =>
                          adminAction({ action: "delete_service", id: service.id })
                        }
                      >
                        Excluir
                      </Button>
                    </div>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </section>
      )}

      {tab === "equipe" && (
        <section className="mt-4 grid gap-4 lg:grid-cols-[1fr_1.1fr]">
          <div className="glass-panel space-y-3 rounded-2xl p-5">
            <h3 className="flex items-center gap-2 font-display text-xl text-stone-50">
              <Users className="h-5 w-5 text-amber-400" />
              Novo barbeiro
            </h3>
            <Input
              placeholder="Nome"
              value={barberForm.name}
              onChange={(e) => setBarberForm({ ...barberForm, name: e.target.value })}
            />
            <Input
              placeholder="Especialidades (separe por vírgula)"
              value={barberForm.specialties}
              onChange={(e) =>
                setBarberForm({ ...barberForm, specialties: e.target.value })
              }
            />
            <Input
              placeholder="URL da foto (https://...)"
              value={barberForm.avatar_url}
              onChange={(e) =>
                setBarberForm({ ...barberForm, avatar_url: e.target.value })
              }
            />
            <p className="text-xs text-stone-500">
              Cole o link de uma foto (Google Drive público, Imgur, site da
              barbearia). Se deixar vazio, o Cortely gera um avatar automático.
            </p>
            {barberForm.avatar_url.trim() && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={barberForm.avatar_url.trim()}
                alt="Prévia"
                className="h-16 w-16 rounded-full object-cover border border-white/10"
              />
            )}
            <Button
              onClick={async () => {
                await adminAction({
                  action: "upsert_barber",
                  name: barberForm.name,
                  specialties: barberForm.specialties
                    .split(",")
                    .map((s) => s.trim())
                    .filter(Boolean),
                  ...(barberForm.avatar_url.trim()
                    ? { avatar_url: barberForm.avatar_url.trim() }
                    : {}),
                });
                setBarberForm({ name: "", specialties: "", avatar_url: "" });
              }}
            >
              Salvar barbeiro
            </Button>
          </div>
          <div className="space-y-3">
            {data.barbers.map((barber) => (
              <article
                key={barber.id}
                className="glass-panel flex flex-col gap-3 rounded-2xl p-4 sm:flex-row sm:items-center"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={barber.avatar_url ?? ""}
                  alt={barber.name}
                  className="h-14 w-14 rounded-full object-cover"
                />
                <div className="flex-1 space-y-2">
                  <h4 className="font-medium text-stone-100">{barber.name}</h4>
                  <p className="text-sm text-stone-400">
                    {barber.specialties.join(" · ")}
                  </p>
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                    <Input
                      placeholder="Nova URL da foto"
                      defaultValue={barber.avatar_url ?? ""}
                      id={`avatar-${barber.id}`}
                    />
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        const input = document.getElementById(
                          `avatar-${barber.id}`,
                        ) as HTMLInputElement | null;
                        const url = input?.value.trim();
                        if (!url) return;
                        adminAction({
                          action: "upsert_barber",
                          id: barber.id,
                          name: barber.name,
                          specialties: barber.specialties,
                          avatar_url: url,
                          is_active: barber.is_active,
                        });
                      }}
                    >
                      Atualizar foto
                    </Button>
                  </div>
                </div>
                <Badge>{barber.is_active ? "Ativo" : "Inativo"}</Badge>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() =>
                    adminAction({
                      action: "upsert_barber",
                      id: barber.id,
                      name: barber.name,
                      specialties: barber.specialties,
                      avatar_url: barber.avatar_url,
                      is_active: !barber.is_active,
                    })
                  }
                >
                  {barber.is_active ? "Desativar" : "Ativar"}
                </Button>
              </article>
            ))}
          </div>
        </section>
      )}

      {tab === "horarios" && (
        <section className="mt-4 space-y-4">
          <div className="glass-panel rounded-2xl p-5">
            <h3 className="mb-3 flex items-center gap-2 font-display text-xl text-stone-50">
              <Clock3 className="h-5 w-5 text-amber-400" />
              Grade por barbeiro
            </h3>
            <select
              className="h-11 w-full rounded-xl border border-white/10 bg-white/5 px-4 text-sm text-stone-100"
              value={hoursBarberId}
              onChange={(e) => setHoursBarberId(e.target.value)}
            >
              {data.barbers.map((b) => (
                <option key={b.id} value={b.id} className="bg-stone-900">
                  {b.name}
                </option>
              ))}
            </select>
            <div className="mt-4 space-y-2">
              {selectedHours
                .slice()
                .sort((a, b) => a.day_of_week - b.day_of_week)
                .map((row) => (
                  <div
                    key={row.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-white/10 px-3 py-2 text-sm text-stone-300"
                  >
                    <span>{DAY_LABELS[row.day_of_week]}</span>
                    <span>
                      {row.start_time.slice(0, 5)}–{row.end_time.slice(0, 5)}
                      {row.break_start
                        ? ` · pausa ${row.break_start.slice(0, 5)}–${row.break_end?.slice(0, 5)}`
                        : ""}
                    </span>
                  </div>
                ))}
            </div>
            <Button
              className="mt-4"
              variant="outline"
              onClick={() =>
                adminAction({
                  action: "set_hours",
                  barber_id: hoursBarberId,
                  rows: [1, 2, 3, 4, 5, 6].map((day) => ({
                    day_of_week: day,
                    start_time: "09:00",
                    end_time: "19:00",
                    break_start: "12:00",
                    break_end: "13:00",
                  })),
                })
              }
            >
              Resetar para Seg–Sáb 09:00–19:00
            </Button>
          </div>
        </section>
      )}

      {tab === "lembretes" && (
        <section className="mt-4 space-y-3">
          <div className="glass-panel rounded-2xl p-5 text-sm text-stone-300">
            Estrutura de lembretes WhatsApp: a cada agendamento, o Cortely cria um
            lembrete {data.shop.reminder_hours_before}h antes. Envie pelo botão e
            marque como enviado.
          </div>
          {data.reminders.length === 0 && (
            <div className="glass-panel rounded-2xl p-8 text-center text-stone-400">
              Nenhum lembrete ainda. Crie um agendamento na página do cliente.
            </div>
          )}
          {data.reminders.map((reminder) => (
            <article
              key={reminder.id}
              className="glass-panel flex flex-col gap-3 rounded-2xl p-4 sm:flex-row sm:items-center sm:justify-between"
            >
              <div>
                <div className="flex items-center gap-2">
                  <h4 className="font-medium text-stone-100">{reminder.client_name}</h4>
                  <Badge>{reminder.status}</Badge>
                </div>
                <p className="mt-1 text-sm text-stone-400">
                  Disparo: {new Date(reminder.scheduled_for).toLocaleString("pt-BR")} ·{" "}
                  {formatPhoneBR(reminder.client_phone)}
                </p>
              </div>
              {reminder.status === "pending" && (
                <div className="flex gap-2">
                  <a
                    href={buildWhatsAppReminderUrl(
                      reminder.client_phone,
                      reminder.message,
                    )}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <Button size="sm">Enviar no WhatsApp</Button>
                  </a>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() =>
                      adminAction({
                        action: "mark_reminder_sent",
                        id: reminder.id,
                      })
                    }
                  >
                    Marcar enviado
                  </Button>
                </div>
              )}
            </article>
          ))}
        </section>
      )}

      {tab === "fidelidade" && (
        <section className="mt-4 space-y-3">
          <div className="glass-panel rounded-2xl p-5 text-sm text-stone-300">
            Meta: <strong>{data.shop.loyalty_threshold}</strong> cortes →{" "}
            {data.shop.loyalty_reward}
          </div>
          {data.loyalty.map((account) => (
            <article
              key={account.id}
              className="glass-panel flex items-center justify-between rounded-2xl p-4"
            >
              <div>
                <p className="font-medium text-stone-100">
                  {account.client_name || "Cliente"}
                </p>
                <p className="text-sm text-stone-400">
                  {formatPhoneBR(account.client_phone)} · {account.total_visits} visitas
                </p>
              </div>
              <p className="font-display text-2xl text-amber-300">
                {account.points}/{data.shop.loyalty_threshold}
              </p>
            </article>
          ))}
        </section>
      )}

      {tab === "config" && (
        <section className="mt-4 glass-panel space-y-3 rounded-2xl p-5">
          <h3 className="flex items-center gap-2 font-display text-xl text-stone-50">
            <Settings2 className="h-5 w-5 text-amber-400" />
            Identidade da barbearia
          </h3>
          <Input
            value={settings.name}
            onChange={(e) => setSettings({ ...settings, name: e.target.value })}
            placeholder="Nome"
          />
          <Input
            value={settings.phone}
            onChange={(e) => setSettings({ ...settings, phone: e.target.value })}
            placeholder="WhatsApp"
          />
          <Input
            value={settings.address}
            onChange={(e) => setSettings({ ...settings, address: e.target.value })}
            placeholder="Endereço"
          />
          <Input
            value={settings.primary_color}
            onChange={(e) =>
              setSettings({ ...settings, primary_color: e.target.value })
            }
            placeholder="Cor primária (#d97706)"
          />
          <Input
            type="number"
            value={settings.loyalty_threshold}
            onChange={(e) =>
              setSettings({
                ...settings,
                loyalty_threshold: Number(e.target.value),
              })
            }
            placeholder="Pontos para recompensa"
          />
          <Input
            value={settings.loyalty_reward}
            onChange={(e) =>
              setSettings({ ...settings, loyalty_reward: e.target.value })
            }
            placeholder="Recompensa"
          />
          <Input
            type="number"
            value={settings.reminder_hours_before}
            onChange={(e) =>
              setSettings({
                ...settings,
                reminder_hours_before: Number(e.target.value),
              })
            }
            placeholder="Horas antes do lembrete"
          />
          <Button
            onClick={() =>
              adminAction({
                action: "update_settings",
                ...settings,
              })
            }
          >
            Salvar configurações
          </Button>
        </section>
      )}
    </main>
  );
}
