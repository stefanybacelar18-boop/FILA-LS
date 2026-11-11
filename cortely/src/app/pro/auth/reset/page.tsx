"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function ResetPasswordPage() {
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/update-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Falha ao atualizar senha");
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-4">
      <form onSubmit={submit} className="glass-panel space-y-4 rounded-3xl p-6">
        <h1 className="font-display text-2xl text-stone-50">Nova senha</h1>
        <p className="text-sm text-stone-400">
          Defina uma senha com pelo menos 8 caracteres. Use o link do e-mail
          para autenticar a sessão antes.
        </p>
        {done ? (
          <p className="text-sm text-emerald-400">
            Senha atualizada.{" "}
            <Link href="/pro" className="underline">
              Entrar
            </Link>
          </p>
        ) : (
          <>
            <Input
              type="password"
              minLength={8}
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Nova senha"
              autoComplete="new-password"
            />
            {error && <p className="text-sm text-rose-400">{error}</p>}
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Salvando…" : "Atualizar senha"}
            </Button>
          </>
        )}
      </form>
    </main>
  );
}
