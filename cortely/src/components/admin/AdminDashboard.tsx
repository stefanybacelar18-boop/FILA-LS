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
  UserRoundX,
  Users,
  XCircle,
} from "lucide-react";
import { AdminCalendar } from "@/components/admin/AdminCalendar";
import { AdminDayBoard } from "@/components/admin/AdminDayBoard";
import { AdminLogin } from "@/components/admin/AdminLogin";
import { AdminOpsPanel } from "@/components/admin/AdminOpsPanel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type {
  Appointment,
  Barber,
  Barbershop,
  Client,
  LoyaltyAccount,
  Reminder,
  ScheduleBlock,
  Service,
  SessionUser,
  WorkingHours,
} from "@/lib/types";
import {
  clearStaffToken,
  staffAuthHeaders,
} from "@/lib/staff-session";
import { formatBRL, formatPhoneBR } from "@/lib/utils";
import { buildWhatsAppReminderUrl } from "@/lib/whatsapp";

type Tab =
  | "agenda"
  | "calendario"
  | "comandas"
  | "despesas"
  | "produtos"
  | "servicos"
  | "equipe"
  | "horarios"
  | "bloqueios"
  | "clientes"
  | "lembretes"
  | "fidelidade"
  | "config"
  | "online"
  | "usuarios"
  | "operacao";

type Permissions = Record<
  | "agenda"
  | "servicos"
  | "equipe"
  | "horarios"
  | "bloqueios"
  | "clientes"
  | "lembretes"
  | "fidelidade"
  | "config"
  | "usuarios",
  boolean
>;

type AdminPayload = {
  shop: Barbershop;
  barbers: Barber[];
  services: Service[];
  workingHours: WorkingHours[];
  todayCount: number;
  confirmedCount: number;
  completedCount: number;
  noShowCount: number;
  loyaltyClients: number;
  pendingReminders: number;
  inactiveClients: number;
  appointments: Appointment[];
  loyalty: LoyaltyAccount[];
  reminders: Reminder[];
  clients: Client[];
  scheduleBlocks: ScheduleBlock[];
  staff: Array<{
    id: string;
    email?: string;
    full_name: string | null;
    role: string;
    barber_id?: string | null;
  }>;
  session: SessionUser;
  permissions: Permissions;
};

const DAY_LABELS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

export function AdminDashboard({ slug }: { slug: string }) {
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [data, setData] = useState<AdminPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>("agenda");
  const [clientQuery, setClientQuery] = useState("");
  const [clientFilter, setClientFilter] = useState<
    "all" | "inactive" | "noshow" | "notes"
  >("all");
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
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
  const [blockForm, setBlockForm] = useState({
    barber_id: "",
    block_date: new Date().toISOString().slice(0, 10),
    start_time: "14:00",
    end_time: "15:00",
    reason: "",
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
    cancel_hours_before: 2,
    booking_link_enabled: true,
    booking_slot_minutes: 30,
    booking_show_prices: true,
    booking_group_by_category: false,
  });

  const reload = useCallback(async () => {
    setLoading(true);
    const res = await fetch(
      `/api/admin?slug=${slug}${clientQuery ? `&q=${encodeURIComponent(clientQuery)}` : ""}`,
      { credentials: "include", headers: staffAuthHeaders() },
    );
    if (res.status === 401) {
      setAuthed(false);
      setData(null);
      setLoading(false);
      throw new Error("Sessão inválida. Tente entrar de novo.");
    }
    const json = await res.json();
    if (!res.ok) {
      setAuthed(false);
      setLoading(false);
      throw new Error(json.error || "Falha ao carregar o painel");
    }
    setAuthed(true);
    setData(json);
    setSettings({
      name: json.shop.name,
      phone: json.shop.phone,
      address: json.shop.address ?? "",
      primary_color: json.shop.primary_color,
      loyalty_threshold: json.shop.loyalty_threshold,
      loyalty_reward: json.shop.loyalty_reward,
      reminder_hours_before: json.shop.reminder_hours_before ?? 24,
      cancel_hours_before: json.shop.cancel_hours_before ?? 2,
      booking_link_enabled: json.shop.booking_link_enabled ?? true,
      booking_slot_minutes: json.shop.booking_slot_minutes ?? 30,
      booking_show_prices: json.shop.booking_show_prices ?? true,
      booking_group_by_category: json.shop.booking_group_by_category ?? false,
    });
    if (!hoursBarberId && json.barbers?.[0]?.id) {
      setHoursBarberId(json.barbers[0].id);
    }
    setBlockForm((prev) =>
      prev.barber_id
        ? prev
        : {
            ...prev,
            barber_id: json.session?.barber_id || json.barbers?.[0]?.id || "",
          },
    );
    setLoading(false);
  }, [slug, hoursBarberId, clientQuery]);

  useEffect(() => {
    reload().catch(() => {
      /* sem sessão no boot — mostra login */
    });
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
      credentials: "include",
      headers: staffAuthHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ id, status }),
    });
    await reload();
  }

  async function adminAction(body: Record<string, unknown>) {
    const res = await fetch(`/api/admin?slug=${slug}`, {
      method: "POST",
      credentials: "include",
      headers: staffAuthHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify(body),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || "Falha na ação");
    await reload();
    return json;
  }

  async function logout() {
    await fetch("/api/auth/logout", {
      method: "POST",
      credentials: "include",
      headers: staffAuthHeaders(),
    });
    clearStaffToken();
    setAuthed(false);
    setData(null);
  }

  const selectedHours = useMemo(() => {
    if (!data || !hoursBarberId) return [];
    return data.workingHours.filter((w) => w.barber_id === hoursBarberId);
  }, [data, hoursBarberId]);

  if (authed === false) {
    return (
      <AdminLogin
        onSuccess={async () => {
          setAuthed(true);
          await reload();
        }}
      />
    );
  }

  if (loading || !data) {
    return (
      <div className="mx-auto max-w-6xl px-5 py-16 text-stone-400">
        Carregando painel…
      </div>
    );
  }

  const canOps = data.session.role !== "barber";
  const navItems: { id: Tab; label: string; group: string }[] = (
    [
      ["agenda", "Agenda do dia", "Agenda"],
      ["calendario", "Calendário", "Agenda"],
      ["bloqueios", "Ausências", "Agenda"],
      ["comandas", "Comandas", "Operação"],
      ["produtos", "Produtos", "Operação"],
      ["despesas", "Despesas", "Operação"],
      ["operacao", "Mais módulos", "Operação"],
      ["clientes", "Clientes", "Cadastros"],
      ["servicos", "Serviços", "Cadastros"],
      ["equipe", "Equipe", "Cadastros"],
      ["horarios", "Horários", "Cadastros"],
      ["lembretes", "Lembretes", "Relacionamento"],
      ["fidelidade", "Barber Points", "Relacionamento"],
      ["online", "Agendamento online", "Sistema"],
      ["config", "Identidade", "Sistema"],
      ["usuarios", "Usuários", "Sistema"],
    ] as const
  )
    .filter(([id]) => {
      if (id === "comandas" || id === "produtos" || id === "despesas" || id === "operacao") {
        return canOps;
      }
      if (id === "calendario" || id === "online") {
        return Boolean(data.permissions.agenda) || Boolean(data.permissions.config);
      }
      if (id === "agenda") return Boolean(data.permissions.agenda);
      return Boolean(data.permissions[id as keyof Permissions]);
    })
    .map(([id, label, group]) => ({ id, label, group }));

  const filteredClients = data.clients.filter((client) => {
    if (clientFilter === "inactive") {
      if (!client.last_visit_at) return true;
      const days =
        (Date.now() - new Date(client.last_visit_at).getTime()) / (1000 * 60 * 60 * 24);
      return days >= 45;
    }
    if (clientFilter === "noshow") return client.no_show_count > 0;
    if (clientFilter === "notes") return Boolean(client.notes?.trim());
    return true;
  });

  function go(id: Tab) {
    setTab(id);
    setMobileNavOpen(false);
  }

  const navGroups = Array.from(new Set(navItems.map((n) => n.group)));

  return (
    <div className="min-h-screen lg:flex">
      <aside
        className={`fixed inset-y-0 left-0 z-40 w-64 border-r border-white/10 bg-[#12100e]/95 p-4 backdrop-blur-xl transition lg:static lg:translate-x-0 ${
          mobileNavOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <p className="text-[10px] uppercase tracking-[0.28em] text-amber-400/80">
          Cortely
        </p>
        <h1 className="mt-1 font-display text-2xl text-stone-50">{data.shop.name}</h1>
        <p className="mt-1 text-xs text-stone-500">
          {data.session.full_name} · {data.session.role}
        </p>
        <nav className="mt-6 space-y-5 overflow-y-auto pb-20">
          {navGroups.map((group) => (
            <div key={group}>
              <p className="mb-2 px-2 text-[10px] uppercase tracking-[0.2em] text-stone-500">
                {group}
              </p>
              <div className="space-y-1">
                {navItems
                  .filter((n) => n.group === group)
                  .map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => go(item.id)}
                      className={`w-full rounded-xl px-3 py-2 text-left text-sm transition ${
                        tab === item.id
                          ? "bg-amber-500/20 text-amber-100"
                          : "text-stone-300 hover:bg-white/5"
                      }`}
                    >
                      {item.label}
                    </button>
                  ))}
              </div>
            </div>
          ))}
        </nav>
        <div className="absolute bottom-4 left-4 right-4 space-y-2">
          <Link href={`/b/${slug}`} className="block">
            <Button variant="outline" size="sm" className="w-full">
              Página do cliente
            </Button>
          </Link>
          <Button variant="secondary" size="sm" className="w-full" onClick={logout}>
            Sair
          </Button>
        </div>
      </aside>
      {mobileNavOpen && (
        <button
          type="button"
          aria-label="Fechar menu"
          className="fixed inset-0 z-30 bg-black/50 lg:hidden"
          onClick={() => setMobileNavOpen(false)}
        />
      )}

      <main className="flex-1 px-4 pb-16 pt-6 sm:px-6 lg:px-8">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Button
              size="sm"
              variant="secondary"
              className="lg:hidden"
              onClick={() => setMobileNavOpen(true)}
            >
              Menu
            </Button>
            <div>
              <p className="text-xs uppercase tracking-[0.22em] text-amber-400/80">
                Painel admin
              </p>
              <h2 className="font-display text-2xl text-stone-50 sm:text-3xl">
                {navItems.find((n) => n.id === tab)?.label ?? "Painel"}
              </h2>
            </div>
          </div>
          <div className="flex gap-2">
            {data.session.role === "barber" && (
              <Link href="/pro">
                <Button variant="outline" size="sm">
                  Portal barbeiro
                </Button>
              </Link>
            )}
          </div>
        </header>

        <section className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          {[
            { label: "Hoje", value: data.todayCount, icon: CalendarDays },
            { label: "Confirmados", value: data.confirmedCount, icon: Scissors },
            { label: "Concluídos", value: data.completedCount, icon: CheckCircle2 },
            { label: "No-show", value: data.noShowCount, icon: UserRoundX },
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

      {(tab === "comandas" ||
        tab === "produtos" ||
        tab === "despesas" ||
        tab === "operacao") &&
        canOps && (
          <AdminOpsPanel
            barbers={data.barbers}
            services={data.services}
            clients={data.clients}
            hideTabs={tab !== "operacao"}
            initialTab={
              tab === "produtos"
                ? "estoque"
                : tab === "despesas"
                  ? "financeiro"
                  : tab === "comandas"
                    ? "caixa"
                    : "caixa"
            }
          />
        )}

      {tab === "agenda" && (
        <section className="mt-4 space-y-3">
          <AdminDayBoard
            appointments={data.appointments}
            barbers={data.barbers}
            services={data.services}
            blocks={data.scheduleBlocks}
            onStatus={setStatus}
          />
        </section>
      )}

      {tab === "calendario" && (
        <section className="mt-4 space-y-3">
          <AdminCalendar
            appointments={data.appointments}
            barbers={data.barbers}
            services={data.services}
          />
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
                      Concluir
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => setStatus(item.id, "no_show")}
                    >
                      <UserRoundX className="h-4 w-4" />
                      Faltou
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

      {tab === "bloqueios" && (
        <section className="mt-4 grid gap-4 lg:grid-cols-[1fr_1.1fr]">
          <div className="glass-panel space-y-3 rounded-2xl p-5">
            <h3 className="font-display text-xl text-stone-50">Bloquear horário</h3>
            <select
              className="h-11 w-full rounded-xl border border-white/10 bg-white/5 px-4 text-sm text-stone-100"
              value={blockForm.barber_id}
              onChange={(e) =>
                setBlockForm({ ...blockForm, barber_id: e.target.value })
              }
              disabled={data.session.role === "barber"}
            >
              {data.barbers
                .filter((b) =>
                  data.session.role === "barber"
                    ? b.id === data.session.barber_id
                    : true,
                )
                .map((b) => (
                  <option key={b.id} value={b.id} className="bg-stone-900">
                    {b.name}
                  </option>
                ))}
            </select>
            <Input
              type="date"
              value={blockForm.block_date}
              onChange={(e) =>
                setBlockForm({ ...blockForm, block_date: e.target.value })
              }
            />
            <div className="grid grid-cols-2 gap-2">
              <Input
                type="time"
                value={blockForm.start_time}
                onChange={(e) =>
                  setBlockForm({ ...blockForm, start_time: e.target.value })
                }
              />
              <Input
                type="time"
                value={blockForm.end_time}
                onChange={(e) =>
                  setBlockForm({ ...blockForm, end_time: e.target.value })
                }
              />
            </div>
            <Input
              placeholder="Motivo (almoço, folga, encaixe…)"
              value={blockForm.reason}
              onChange={(e) => setBlockForm({ ...blockForm, reason: e.target.value })}
            />
            <Button
              onClick={() =>
                adminAction({
                  action: "create_block",
                  ...blockForm,
                  reason: blockForm.reason || null,
                })
              }
            >
              Criar bloqueio
            </Button>
          </div>
          <div className="space-y-3">
            {data.scheduleBlocks.length === 0 && (
              <div className="glass-panel rounded-2xl p-8 text-center text-stone-400">
                Nenhum bloqueio pontual.
              </div>
            )}
            {data.scheduleBlocks.map((block) => (
              <article
                key={block.id}
                className="glass-panel flex items-center justify-between gap-3 rounded-2xl p-4"
              >
                <div>
                  <p className="font-medium text-stone-100">
                    {barberMap.get(block.barber_id)?.name} · {block.block_date}
                  </p>
                  <p className="text-sm text-stone-400">
                    {block.start_time.slice(0, 5)}–{block.end_time.slice(0, 5)}
                    {block.reason ? ` · ${block.reason}` : ""}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="danger"
                  onClick={() => adminAction({ action: "delete_block", id: block.id })}
                >
                  Remover
                </Button>
              </article>
            ))}
          </div>
        </section>
      )}

      {tab === "clientes" && (
        <section className="mt-4 space-y-4">
          <div className="glass-panel rounded-2xl p-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h3 className="font-display text-xl text-stone-50">Clientes</h3>
                <p className="text-sm text-stone-400">
                  {data.inactiveClients} cliente(s) inativos (45+ dias sem visita)
                </p>
              </div>
              <div className="flex gap-2">
                <Input
                  placeholder="Buscar nome, WhatsApp ou nota"
                  value={clientQuery}
                  onChange={(e) => setClientQuery(e.target.value)}
                />
                <Button variant="secondary" onClick={() => reload()}>
                  Buscar
                </Button>
              </div>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {(
                [
                  ["all", "Todos"],
                  ["inactive", "Inativos"],
                  ["noshow", "Com faltas"],
                  ["notes", "Com observações"],
                ] as const
              ).map(([id, label]) => (
                <Button
                  key={id}
                  size="sm"
                  variant={clientFilter === id ? "default" : "secondary"}
                  onClick={() => setClientFilter(id)}
                >
                  {label}
                </Button>
              ))}
            </div>
          </div>
          {filteredClients.map((client) => (
            <article key={client.id} className="glass-panel space-y-3 rounded-2xl p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-medium text-stone-100">{client.full_name}</p>
                  <p className="text-sm text-stone-400">
                    {formatPhoneBR(client.phone)} · {client.total_visits} visitas ·{" "}
                    {client.no_show_count} faltas
                  </p>
                  <p className="text-xs text-stone-500">
                    Última visita:{" "}
                    {client.last_visit_at
                      ? new Date(client.last_visit_at).toLocaleDateString("pt-BR")
                      : "—"}
                  </p>
                </div>
              </div>
              <Input
                defaultValue={client.notes ?? ""}
                placeholder="Observações do cliente"
                id={`notes-${client.id}`}
              />
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  const input = document.getElementById(
                    `notes-${client.id}`,
                  ) as HTMLInputElement | null;
                  adminAction({
                    action: "update_client",
                    id: client.id,
                    notes: input?.value ?? "",
                  });
                }}
              >
                Salvar observação
              </Button>
            </article>
          ))}
        </section>
      )}

      {tab === "lembretes" && (
        <section className="mt-4 space-y-3">
          <div className="glass-panel rounded-2xl p-5 text-sm text-stone-300">
            Lembretes WhatsApp {data.shop.reminder_hours_before}h antes. Com
            WHATSAPP_API_TOKEN o envio é automático via{" "}
            <code>/api/reminders/process</code>; sem API, use o wa.me.
          </div>
          {data.reminders.length === 0 && (
            <div className="glass-panel rounded-2xl p-8 text-center text-stone-400">
              Nenhum lembrete ainda.
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
                  <Badge>{reminder.delivery_mode}</Badge>
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
          <Input
            type="number"
            value={settings.cancel_hours_before}
            onChange={(e) =>
              setSettings({
                ...settings,
                cancel_hours_before: Number(e.target.value),
              })
            }
            placeholder="Horas mínimas para cancelar/reagendar"
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

      {tab === "online" && (
        <section className="mt-4 glass-panel space-y-4 rounded-2xl p-5">
          <div>
            <h3 className="font-display text-xl text-stone-50">
              Configuração do agendamento online
            </h3>
            <p className="mt-1 text-sm text-stone-400">
              Controla o link público{" "}
              <Link className="text-amber-300 underline" href={`/b/${slug}`}>
                /b/{slug}
              </Link>
            </p>
          </div>
          <label className="flex items-center justify-between gap-3 rounded-xl border border-white/10 px-4 py-3 text-sm text-stone-200">
            Link de agendamento ativo
            <input
              type="checkbox"
              checked={settings.booking_link_enabled}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  booking_link_enabled: e.target.checked,
                })
              }
            />
          </label>
          <label className="flex items-center justify-between gap-3 rounded-xl border border-white/10 px-4 py-3 text-sm text-stone-200">
            Mostrar preços no agendamento
            <input
              type="checkbox"
              checked={settings.booking_show_prices}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  booking_show_prices: e.target.checked,
                })
              }
            />
          </label>
          <label className="flex items-center justify-between gap-3 rounded-xl border border-white/10 px-4 py-3 text-sm text-stone-200">
            Agrupar serviços por categoria
            <input
              type="checkbox"
              checked={settings.booking_group_by_category}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  booking_group_by_category: e.target.checked,
                })
              }
            />
          </label>
          <div>
            <label className="mb-2 block text-xs uppercase tracking-wide text-stone-500">
              Intervalo entre horários (minutos)
            </label>
            <Input
              type="number"
              min={5}
              max={120}
              value={settings.booking_slot_minutes}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  booking_slot_minutes: Number(e.target.value),
                })
              }
            />
          </div>
          <Button
            onClick={() =>
              adminAction({
                action: "update_settings",
                ...settings,
              })
            }
          >
            Salvar agendamento online
          </Button>
        </section>
      )}

      {tab === "usuarios" && (
        <section className="mt-4 space-y-3">
          <div className="glass-panel rounded-2xl p-5 text-sm text-stone-300">
            Papéis: owner (tudo), reception (operação), barber (própria agenda +
            bloqueios).
          </div>
          {data.staff.map((user) => (
            <article
              key={user.id}
              className="glass-panel flex items-center justify-between rounded-2xl p-4"
            >
              <div>
                <p className="font-medium text-stone-100">{user.full_name}</p>
                <p className="text-sm text-stone-400">{user.email}</p>
              </div>
              <Badge>{user.role}</Badge>
            </article>
          ))}
        </section>
      )}
      </main>
    </div>
  );
}
