/** URL pública do app — nunca use 0.0.0.0 no navegador */
export function getConfiguredAppUrl(): string | null {
  const raw = process.env.NEXT_PUBLIC_APP_URL?.trim().replace(/\/$/, "");
  if (!raw || raw.includes("0.0.0.0")) return null;
  return raw;
}

function originFromHost(protocol: string, host: string | null): string | null {
  if (!host || host.startsWith("0.0.0.0")) return null;
  return `${protocol}//${host}`;
}

/** Origem correta para OAuth e redirects (cliente) — usa o host atual do navegador */
export function resolveAppOrigin(): string {
  if (typeof window !== "undefined") {
    const { protocol, hostname, port, origin } = window.location;
    if (hostname !== "0.0.0.0") return origin;
    const portSuffix = port ? `:${port}` : "";
    return `${protocol}//localhost${portSuffix}`;
  }

  const configured = getConfiguredAppUrl();
  if (configured) return configured;

  return "http://localhost:3000";
}

/** Origem correta no callback OAuth (servidor) */
export function resolveAppOriginFromRequest(requestUrl: string, hostHeader?: string | null): string {
  const url = new URL(requestUrl);
  if (url.hostname !== "0.0.0.0") return url.origin;

  const fromHost = originFromHost(url.protocol, hostHeader ?? null);
  if (fromHost) return fromHost;

  const configured = getConfiguredAppUrl();
  if (configured) return configured;

  const portSuffix = url.port ? `:${url.port}` : ":3000";
  return `${url.protocol}//localhost${portSuffix}`;
}

export function oauthCallbackPath(context: "motorista" | "staff" = "motorista"): string {
  return context === "staff" ? "/auth/callback?context=staff" : "/auth/callback";
}

export function oauthRedirectUrl(origin: string, context: "motorista" | "staff" = "motorista"): string {
  return `${origin.replace(/\/$/, "")}${oauthCallbackPath(context)}`;
}
