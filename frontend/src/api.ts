import { API_URL } from "@/src/theme";
import { storage } from "@/src/utils/storage";

export const AUTH_TOKEN_KEY = "auth_token";

export class ApiError extends Error {
  status?: number;

  constructor(message: string, status?: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

const detailMessage = (payload: unknown, fallback: string) => {
  if (!payload || typeof payload !== "object") return fallback;
  const detail = (payload as { detail?: unknown }).detail;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    const messages = detail
      .map((item) => (item && typeof item === "object" ? (item as { msg?: unknown }).msg : null))
      .filter((item): item is string => typeof item === "string");
    if (messages.length > 0) return messages.join(" · ");
  }
  return fallback;
};

export async function apiRequest<T>(path: string, init?: RequestInit): Promise<T> {
  if (!API_URL) {
    throw new ApiError("Il collegamento al backend non è configurato");
  }

  let response: Response;
  try {
    const token = await storage.secureGet<string>(AUTH_TOKEN_KEY, "");
    const headers = new Headers(init?.headers);
    if (token) headers.set("Authorization", `Bearer ${token}`);
    response = await fetch(`${API_URL}${path}`, { ...init, headers });
  } catch {
    throw new ApiError("Impossibile raggiungere il server. Controlla la connessione e riprova.");
  }

  const contentType = response.headers.get("content-type") || "";
  const payload = contentType.includes("application/json") ? await response.json() : await response.text();
  if (!response.ok) {
    throw new ApiError(detailMessage(payload, `Operazione non riuscita (${response.status})`), response.status);
  }
  return payload as T;
}

export async function saveAuthToken(token: string) {
  return storage.secureSet(AUTH_TOKEN_KEY, token);
}

export async function removeAuthToken() {
  return storage.secureRemove(AUTH_TOKEN_KEY);
}

export function apiErrorMessage(error: unknown, fallback = "Operazione non riuscita") {
  return error instanceof Error && error.message ? error.message : fallback;
}
