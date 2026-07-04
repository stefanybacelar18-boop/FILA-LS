"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Download, Share, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { APP_NAME } from "@/lib/constants";

const HIDDEN_PREFIXES = [
  "/motorista",
  "/checkin",
  "/minha-fila",
  "/empilhador",
  "/admin",
  "/dashboard",
  "/historico",
];

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function isMobile(): boolean {
  if (typeof window === "undefined") return false;
  return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
}

function isIos(): boolean {
  if (typeof window === "undefined") return false;
  return /iPhone|iPad|iPod/i.test(navigator.userAgent);
}

const DISMISS_KEY = "fila-lsl-install-dismissed";

/** Banner para instalar o app — some quando aberto em modo standalone (sem barra de URL). */
export function InstallAppBanner() {
  const pathname = usePathname();
  const [visible, setVisible] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [iosHint, setIosHint] = useState(false);

  useEffect(() => {
    if (HIDDEN_PREFIXES.some((p) => pathname.startsWith(p))) {
      setVisible(false);
      return;
    }
    if (isStandalone()) return;
    if (sessionStorage.getItem(DISMISS_KEY)) return;
    if (!isMobile()) return;

    setVisible(true);
    setIosHint(isIos());

    function onBeforeInstall(e: Event) {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      setIosHint(false);
    }

    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    return () => window.removeEventListener("beforeinstallprompt", onBeforeInstall);
  }, [pathname]);

  const dismiss = useCallback(() => {
    sessionStorage.setItem(DISMISS_KEY, "1");
    setVisible(false);
  }, []);

  async function installAndroid() {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    setDeferredPrompt(null);
    dismiss();
  }

  if (!visible) return null;

  return (
    <div className="fixed inset-x-0 bottom-0 z-50 border-t border-brand/20 bg-white p-4 shadow-[0_-8px_32px_rgba(21,101,192,0.15)] pb-[max(1rem,env(safe-area-inset-bottom))]">
      <div className="mx-auto flex max-w-lg items-start gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand text-white">
          <Download className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-bold text-slate-900">Instale o app {APP_NAME}</p>
          <p className="mt-0.5 text-xs leading-relaxed text-slate-600">
            {iosHint
              ? "Toque em Compartilhar → Adicionar à Tela de Início. Abre em tela cheia, sem barra do navegador."
              : deferredPrompt
                ? "Instale na tela inicial — experiência de app profissional, sem barra de endereço."
                : "Use o menu do navegador → Instalar app ou Adicionar à tela inicial."}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {deferredPrompt && (
              <Button type="button" size="sm" onClick={installAndroid}>
                Instalar app
              </Button>
            )}
            {iosHint && (
              <span className="inline-flex items-center gap-1 text-xs font-medium text-brand">
                <Share className="h-3.5 w-3.5" />
                Safari → Compartilhar → Tela de Início
              </span>
            )}
            <button
              type="button"
              onClick={dismiss}
              className="text-xs text-slate-400 underline-offset-2 hover:text-slate-600 hover:underline"
            >
              Agora não
            </button>
          </div>
        </div>
        <button
          type="button"
          onClick={dismiss}
          className="shrink-0 rounded-lg p-1 text-slate-400 hover:bg-slate-100"
          aria-label="Fechar"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

export { isStandalone };
