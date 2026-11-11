"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function OnboardingPage() {
  const router = useRouter();
  const [shopName, setShopName] = useState("");
  const [shopSlug, setShopSlug] = useState("");
  const [shopPhone, setShopPhone] = useState("");
  const [fullName, setFullName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/complete-onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          shop_name: shopName,
          shop_slug: shopSlug,
          shop_phone: shopPhone,
          full_name: fullName || undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Falha no onboarding");
      router.push("/admin");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-4">
      <form onSubmit={submit} className="glass-panel space-y-4 rounded-3xl p-6">
        <div>
          <p className="text-xs uppercase tracking-[0.22em] text-amber-400/80">
            Cortely
          </p>
          <h1 className="mt-2 font-display text-3xl text-stone-50">
            Sua barbearia
          </h1>
          <p className="mt-2 text-sm text-stone-400">
            Disponível somente após confirmar o e-mail e entrar com sua conta.
          </p>
        </div>
        <Input
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          placeholder="Seu nome"
        />
        <Input
          value={shopName}
          onChange={(e) => setShopName(e.target.value)}
          placeholder="Nome da barbearia"
          required
          minLength={2}
        />
        <Input
          value={shopSlug}
          onChange={(e) =>
            setShopSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))
          }
          placeholder="slug-da-loja"
          required
          minLength={2}
          pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
        />
        <Input
          value={shopPhone}
          onChange={(e) => setShopPhone(e.target.value)}
          placeholder="WhatsApp da loja"
          required
          minLength={10}
        />
        {error && <p className="text-sm text-rose-400">{error}</p>}
        <Button type="submit" className="w-full" disabled={loading}>
          {loading ? "Criando…" : "Criar barbearia"}
        </Button>
        <Link href="/pro" className="block text-center text-sm text-stone-400">
          Voltar ao login
        </Link>
      </form>
    </main>
  );
}
