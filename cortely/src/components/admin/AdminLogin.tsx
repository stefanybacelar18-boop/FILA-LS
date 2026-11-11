"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { clearStaffToken } from "@/lib/staff-session";

type Props = {
  onSuccess: () => void | Promise<void>;
};

export function AdminLogin({ onSuccess }: Props) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function login(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          data.error ||
            (res.status === 429
              ? "Muitas tentativas. Aguarde alguns minutos."
              : "Falha no login"),
        );
      }
      clearStaffToken();
      await onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-4">
      <form onSubmit={login} className="glass-panel space-y-4 rounded-3xl p-6">
        <div>
          <p className="text-xs uppercase tracking-[0.22em] text-amber-400/80">
            Cortely Admin
          </p>
          <h1 className="mt-2 font-display text-3xl text-stone-50">Entrar</h1>
          <p className="mt-2 text-sm text-stone-400">
            Use o e-mail e a senha configurados nos secrets do ambiente.
          </p>
        </div>
        <Input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="E-mail"
          required
          autoComplete="username"
        />
        <Input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Senha"
          required
          autoComplete="current-password"
          minLength={8}
        />
        {error && <p className="text-sm text-rose-400">{error}</p>}
        <Button type="submit" className="w-full" disabled={loading}>
          {loading ? "Entrando…" : "Acessar painel"}
        </Button>
      </form>
    </main>
  );
}
