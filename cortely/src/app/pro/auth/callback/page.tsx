"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

/**
 * Destino do link de confirmação de e-mail / magic.
 * O hash/fragment do Supabase é processado no cliente; em seguida o usuário
 * completa o onboarding ou entra no painel.
 */
export default function AuthCallbackPage() {
  const [message, setMessage] = useState("Confirmando sessão…");

  useEffect(() => {
    const hash = typeof window !== "undefined" ? window.location.hash : "";
    if (hash.includes("error")) {
      setMessage("Não foi possível confirmar o e-mail. Solicite um novo link.");
      return;
    }
    if (hash.includes("access_token") || hash.includes("type=signup") || hash.includes("type=recovery")) {
      setMessage(
        "E-mail confirmado. Faça login e conclua o cadastro da barbearia se ainda não o fez.",
      );
      return;
    }
    setMessage("Se o e-mail foi confirmado, você já pode entrar no painel.");
  }, []);

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-4">
      <div className="glass-panel space-y-4 rounded-3xl p-6">
        <h1 className="font-display text-2xl text-stone-50">Confirmação</h1>
        <p className="text-sm text-stone-400">{message}</p>
        <Link
          href="/pro"
          className="inline-flex text-sm font-medium text-amber-400 underline-offset-4 hover:underline"
        >
          Ir para o login
        </Link>
        <Link
          href="/pro/onboarding"
          className="ml-4 inline-flex text-sm font-medium text-stone-300 underline-offset-4 hover:underline"
        >
          Concluir barbearia
        </Link>
      </div>
    </main>
  );
}
