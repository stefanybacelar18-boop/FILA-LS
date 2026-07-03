"use client";

import { useEffect, useState } from "react";
import { resolveAppOrigin } from "@/lib/app-url";

/** URL pública para QR codes e links compartilhados (usa o host atual no navegador). */
export function usePublicAppUrl(): string {
  const [url, setUrl] = useState(
    () => process.env.NEXT_PUBLIC_APP_URL?.trim().replace(/\/$/, "") || "http://localhost:3000"
  );

  useEffect(() => {
    setUrl(resolveAppOrigin());
  }, []);

  return url;
}
