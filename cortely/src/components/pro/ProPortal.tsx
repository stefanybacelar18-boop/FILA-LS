"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { AdminLogin } from "@/components/admin/AdminLogin";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { Appointment, SessionUser } from "@/lib/types";
import type { CommissionEntry } from "@/lib/types-ops";
import { formatBRL } from "@/lib/utils";

type ProData = {
  session: SessionUser;
  commissions: CommissionEntry[];
  ranking: {
    revenue: number;
    services: number;
    commission: number;
    goal: { revenue_target: number; services_target: number } | null;
  } | null;
  goal: { revenue_target: number; services_target: number; month: string } | null;
};

export function ProPortal() {
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [data, setData] = useState<ProData | null>(null);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [blockDate, setBlockDate] = useState(new Date().toISOString().slice(0, 10));
  const [msg, setMsg] = useState<string | null>(null);

  const reload = useCallback(async () => {
    const me = await fetch("/api/auth/me");
    if (!me.ok) {
      setAuthed(false);
      return;
    }
    const { user } = await me.json();
    if (user.role !== "barber") {
      setAuthed(true);
      setData(null);
      setMsg("Portal do profissional é para perfil barbeiro. Use /admin.");
      return;
    }
    setAuthed(true);
    const [ops, admin] = await Promise.all([
      fetch("/api/ops?view=pro"),
      fetch("/api/admin?slug=navalha-negra"),
    ]);
    const opsJson = await ops.json();
    const adminJson = await admin.json();
    if (ops.ok) setData(opsJson);
    if (admin.ok) {
      setAppointments(
        (adminJson.appointments as Appointment[]).filter(
          (a) => a.barber_id === user.barber_id,
        ),
      );
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  if (authed === false) return <AdminLogin onSuccess={() => reload()} />;
  if (!data && !msg) {
    return <div className="p-10 text-stone-400">Carregando portal…</div>;
  }

  return (
    <main className="mx-auto min-h-screen max-w-3xl px-4 py-8">
      <header className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-amber-400/80">
            Portal do profissional
          </p>
          <h1 className="font-display text-3xl text-stone-50">
            {data?.session.full_name ?? "Barbeiro"}
          </h1>
        </div>
        <div className="flex gap-2">
          <Link href="/admin">
            <Button size="sm" variant="secondary">
              Admin
            </Button>
          </Link>
          <Button
            size="sm"
            variant="outline"
            onClick={async () => {
              await fetch("/api/auth/logout", { method: "POST" });
              setAuthed(false);
            }}
          >
            Sair
          </Button>
        </div>
      </header>

      {msg && <p className="mt-4 text-amber-200">{msg}</p>}

      {data && (
        <>
          <section className="mt-6 grid gap-3 sm:grid-cols-3">
            <div className="glass-panel rounded-2xl p-4">
              <p className="text-sm text-stone-400">Receita no mês</p>
              <p className="font-display text-2xl">
                {formatBRL(data.ranking?.revenue ?? 0)}
              </p>
            </div>
            <div className="glass-panel rounded-2xl p-4">
              <p className="text-sm text-stone-400">Comissões</p>
              <p className="font-display text-2xl">
                {formatBRL(data.ranking?.commission ?? 0)}
              </p>
            </div>
            <div className="glass-panel rounded-2xl p-4">
              <p className="text-sm text-stone-400">Meta</p>
              <p className="font-display text-2xl">
                {data.goal ? formatBRL(data.goal.revenue_target) : "—"}
              </p>
            </div>
          </section>

          <section className="mt-6 space-y-3">
            <h2 className="font-display text-xl">Minha agenda</h2>
            {appointments.length === 0 && (
              <p className="text-stone-500">Nenhum agendamento.</p>
            )}
            {appointments.map((a) => (
              <article
                key={a.id}
                className="glass-panel flex flex-wrap items-center justify-between gap-3 rounded-2xl p-4"
              >
                <div>
                  <div className="flex gap-2">
                    <p className="font-medium">{a.client_name}</p>
                    <Badge>{a.status}</Badge>
                  </div>
                  <p className="text-sm text-stone-400">
                    {a.appointment_date} · {a.start_time.slice(0, 5)}
                  </p>
                </div>
                {a.status === "confirmed" && (
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      onClick={async () => {
                        await fetch("/api/appointments", {
                          method: "PATCH",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ id: a.id, status: "completed" }),
                        });
                        reload();
                      }}
                    >
                      Concluir
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={async () => {
                        await fetch("/api/appointments", {
                          method: "PATCH",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ id: a.id, status: "no_show" }),
                        });
                        reload();
                      }}
                    >
                      Faltou
                    </Button>
                  </div>
                )}
              </article>
            ))}
          </section>

          <section className="mt-6 glass-panel space-y-3 rounded-2xl p-5">
            <h2 className="font-display text-xl">Solicitar bloqueio</h2>
            <Input
              type="date"
              value={blockDate}
              onChange={(e) => setBlockDate(e.target.value)}
            />
            <Button
              onClick={async () => {
                if (!data.session.barber_id) return;
                await fetch("/api/admin?slug=navalha-negra", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    action: "create_block",
                    barber_id: data.session.barber_id,
                    block_date: blockDate,
                    start_time: "12:00",
                    end_time: "13:00",
                    reason: "Solicitação pelo portal do profissional",
                  }),
                });
                setMsg("Bloqueio criado na sua agenda.");
              }}
            >
              Bloquear 12:00–13:00
            </Button>
          </section>

          <section className="mt-6 space-y-2">
            <h2 className="font-display text-xl">Comissões</h2>
            {data.commissions.slice(0, 15).map((c) => (
              <div key={c.id} className="text-sm text-stone-400">
                {formatBRL(c.amount)} · {c.status} ·{" "}
                {new Date(c.created_at).toLocaleDateString("pt-BR")}
              </div>
            ))}
          </section>
        </>
      )}
    </main>
  );
}
