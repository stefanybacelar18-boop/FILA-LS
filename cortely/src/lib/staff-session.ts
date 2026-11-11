/** Token de sessão staff no browser (fallback quando cookie serverless falha). */
const KEY = "cortely_staff_token";

export function saveStaffToken(token: string) {
  try {
    sessionStorage.setItem(KEY, token);
  } catch {
    /* ignore */
  }
}

export function clearStaffToken() {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}

export function getStaffToken() {
  try {
    return sessionStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export function staffAuthHeaders(extra?: HeadersInit): HeadersInit {
  const token = getStaffToken();
  return {
    ...(extra || {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}
