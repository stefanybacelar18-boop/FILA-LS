"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { AdminLogin } from "@/components/admin/AdminLogin";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  clearStaffToken,
  staffAuthHeaders,
} from "@/lib/staff-session";
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
    const me = await fetch("/api/auth/me", {
      credentials: "include",
      headers: staffAuthHeaders(),
    });
    if (!me.ok) {
      setAuthed(false);
      throw new Error("Sessão inválida. Tente entrar de novo.");
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
      fetch("/api/ops?view=pro", {
        credentials: "include",
        headers: staffAuthHeaders(),
      }),
      fetch("/api/admin?slug=navalha-negra", {
        credentials: "include",
        headers: staffAuthHeaders(),
      }),
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
    reload().catch(() => {
      /* sem sessão */
    });
  }, [reload]);

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
          <Link
            href="/admin"
            className="inline-flex h-9 items-center rounded-xl border border-white/10 bg-white/8 px-3 text-xs font-semibold text-stone-100"
          >
            Admin
          </Link>
          <Button
            size="sm"
            variant="ghost"
            onClick={async () => {
              await fetch("/api/auth/logout", {
                method: "POST",
                credentials: "include",
                headers: staffAuthHeaders(),
              });
              clearStaffToken();
              setAuthed(false);
              setData(null);
            }}
          >
            Sair
          </Button>
        </div>
      </header>

      {msg && <p className="mt-4 text-sm text-amber-300">{msg}</p>}

      {data && (
        <section className="mt-6 grid gap-3 sm:grid-cols-3">
          <div className="glass-panel rounded-2xl p-4">
            <p className="text-xs text-stone-400">Receita no ranking</p>
            <p className="mt-1 text-xl text-stone-50">
              {formatBRL(data.ranking?.revenue ?? 0)}
            </p>
          </div>
          <div className="glass-panel rounded-2xl p-4">
            <p className="text-xs text-stone-400">Serviços</p>
            <p className="mt-1 text-xl text-stone-50">
              {data.ranking?.services ?? 0}
            </p>
          </div>
          <div className="glass-panel rounded-2xl p-4">
            <p className="text-xs text-stone-400">Comissão</p>
            <p className="mt-1 text-xl text-stone-50">
              {formatBRL(data.ranking?.commission ?? 0)}
            </p>
          </div>
        </section>
      )}

      <section className="mt-8 space-y-3">
        <h2 className="font-display text-2xl text-stone-50">Minha agenda</h2>
        {appointments.length === 0 && (
          <p className="text-sm text-stone-500">Nenhum horário listado.</p>
        )}
        {appointments.map((item) => (
          <div
            key={item.id}
            className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-white/10 p-4"
          >
            <div>
              <p className="font-medium text-stone-100">{item.client_name}</p>
              <p className="text-sm text-stone-400">
                {item.appointment_date} · {item.start_time.slice(0, 5)}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Badge>{item.status}</Badge>
              {item.status === "confirmed" && (
                <>
                  <Button
                    size="sm"
                    onClick={async () => {
                      await fetch("/api/appointments", {
                        method: "PATCH",
                        credentials: "include",
                        headers: staffAuthHeaders({
                          "Content-Type": "application/json",
                        }),
                        body: JSON.stringify({
                          id: item.id,
                          status: "completed",
                        }),
                      });
                      await reload();
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
                        credentials: "include",
                        headers: staffAuthHeaders({
                          "Content-Type": "application/json",
                        }),
                        body: JSON.stringify({
                          id: item.id,
                          status: "no_show",
                        }),
                      });
                      await reload();
                    }}
                  >
                    No-show
                  </Button>
                </>
              )}
            </div>
          </div>
        ))}
      </section>

      <section className="mt-8 glass-panel space-y-3 rounded-2xl p-4">
        <h2 className="font-display text-xl text-stone-50">Bloquear horário</h2>
        <Input
          type="date"
          value={blockDate}
          onChange={(e) => setBlockDate(e.target.value)}
        />
        <Button
          onClick={async () => {
            const me = await fetch("/api/auth/me", {
              credentials: "include",
              headers: staffAuthHeaders(),
            });
            const { user } = await me.json();
            await fetch("/api/admin?slug=navalha-negra", {
              method: "POST",
              credentials: "include",
              headers: staffAuthHeaders({ "Content-Type": "application/json" }),
              body: JSON.stringify({
                action: "create_block",
                barber_id: user.barber_id,
                block_date: blockDate,
                start_time: "12:00",
                end_time: "13:00",
                reason: "Bloqueio pelo portal",
              }),
            });
            setMsg("Bloqueio solicitado.");
          }}
        >
          Bloquear almoço
        </Button>
      </section>

      {data && data.commissions.length > 0 && (
        <section className="mt-8 space-y-2">
          <h2 className="font-display text-xl text-stone-50">Comissões</h2>
          {data.commissions.slice(0, 10).map((c) => (
            <div
              key={c.id}
              className="flex justify-between rounded-xl border border-white/10 px-3 py-2 text-sm"
            >
              <span className="text-stone-300">{c.status}</span>
              <span className="text-stone-100">{formatBRL(c.amount)}</span>
            </div>
          ))}
        </section>
      )}
    </main>
  );
}
