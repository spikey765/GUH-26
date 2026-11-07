import type { AgentEvent, Forecast, GuessResult, Profile, Simulation, Warning } from "./types";

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

async function call<T>(token: string, path: string, init: RequestInit = {}): Promise<T> {
  let res: Response;
  try {
    const json = !(init.body instanceof FormData);
    res = await fetch(`${BASE}${path}`, {
      ...init,
      headers: { ...(json ? { "Content-Type": "application/json" } : {}), Authorization: `Bearer ${token}`, ...(init.headers ?? {}) },
    });
  } catch {
    throw new ApiError(0, "Can't reach the Heads Up server. Check it is running on " + BASE);
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new ApiError(res.status, typeof body.detail === "string" ? body.detail : `Request failed (${res.status})`);
  }
  return res.json();
}

export const api = (token: string) => ({
  health: () => call<{ auth: string; ai: string; model: string; today: string }>(token, "/health"),
  getProfile: () => call<{ profile: Profile; source: "saved" | "default" }>(token, "/profile"),
  putProfile: (p: Profile) => call<{ profile: Profile }>(token, "/profile", { method: "PUT", body: JSON.stringify(p) }),
  guessProfile: (file?: File | Blob) => {
    if (!file) return call<GuessResult>(token, "/profile/guess", { method: "POST" });
    const form = new FormData();
    form.append("file", file, file instanceof File ? file.name : "statement.pdf");
    return call<GuessResult>(token, "/profile/guess", { method: "POST", body: form });
  },
  forecast: () => call<Forecast>(token, "/forecast"),
  warnings: () => call<{ warnings: Warning[] }>(token, "/warnings"),
  simulate: (body: { amount_gbp: number; date: string; label: string }) =>
    call<Simulation>(token, "/simulate", { method: "POST", body: JSON.stringify(body) }),
  action: (body: { warning_id: string; confirmed: boolean; amount_gbp?: number; date?: string; label?: string; weekly_gbp?: number }) =>
    call<{ forecast: Forecast; warnings: Warning[] }>(token, "/actions", { method: "POST", body: JSON.stringify(body) }),
  resetActions: () => call<{ ok: boolean }>(token, "/actions", { method: "DELETE" }),
  agentLog: () => call<{ events: AgentEvent[] }>(token, "/agent-log"),
});
