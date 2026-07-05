"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  recoverOAuthCodeFromUrl,
  redirectAuthenticatedMotorista,
  waitForSupabaseSession,
} from "@/lib/motorista-auth-redirect";

/** Na home (/), recupera OAuth e redireciona motorista já logado. */
export function EntryAuthRedirect() {
  const router = useRouter();

  useEffect(() => {
    if (recoverOAuthCodeFromUrl("motorista")) return;

    const supabase = createClient();
    let cancelled = false;

    async function run() {
      await waitForSupabaseSession(supabase, 4, 300);
      if (cancelled) return;
      await redirectAuthenticatedMotorista(supabase, router);
    }

    void run();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN" && !cancelled) {
        void redirectAuthenticatedMotorista(supabase, router);
      }
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, [router]);

  return null;
}
