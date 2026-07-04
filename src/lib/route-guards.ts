import { toAppRole } from "@/lib/types";

const PUBLIC_PREFIXES = [
  "/login",
  "/auth",
  "/tv",
  "/fila",
  "/fila-descarga",
  "/api",
  "/cadastro",
  "/_next",
  "/favicon",
];

export function isPublicPath(pathname: string): boolean {
  if (pathname === "/") return true;
  return PUBLIC_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

export function requiredRoleForPath(pathname: string): "administrador" | "empilhador" | "motorista" | null {
  if (pathname.startsWith("/admin") || pathname.startsWith("/historico")) {
    return "administrador";
  }
  if (pathname.startsWith("/empilhador") || pathname.startsWith("/dashboard")) {
    return "empilhador";
  }
  if (
    pathname.startsWith("/motorista") ||
    pathname.startsWith("/checkin") ||
    pathname.startsWith("/minha-fila")
  ) {
    return "motorista";
  }
  return null;
}

export function roleMatchesPath(profileRole: string, required: "administrador" | "empilhador" | "motorista"): boolean {
  const app = toAppRole(profileRole);
  if (required === "administrador") return app === "administrador";
  if (required === "empilhador") return app === "empilhador" || app === "administrador";
  return app === "motorista";
}

export function loginPathForRole(required: "administrador" | "empilhador" | "motorista"): string {
  return required === "motorista" ? "/login/motorista" : "/login";
}
