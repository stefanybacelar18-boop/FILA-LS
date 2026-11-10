"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Props = {
  onSuccess: () => void;
};

export function AdminLogin({ onSuccess }: Props) {
  const [email, setEmail] = useState("dono@cortely.demo");
  const [password, setPassword] = useState("dono123");
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
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Falha no login");
      onSuccess();
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
            Demo: dono@cortely.demo / dono123 · recepcao@cortely.demo /
            recepcao123 · rafael@cortely.demo / barbeiro123
          </p>
        </div>
        <Input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="E-mail"
          required
        />
        <Input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Senha"
          required
        />
        {error && <p className="text-sm text-rose-400">{error}</p>}
        <Button type="submit" className="w-full" disabled={loading}>
          {loading ? "Entrando…" : "Acessar painel"}
        </Button>
      </form>
    </main>
  );
}
