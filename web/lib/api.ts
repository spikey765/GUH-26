import type { AgentEvent, Forecast, GuessResult, NewsItem, Profile, Simulation, Warning } from "./types";

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
    throw new ApiError(0, "Can't reach the HeadsUp server. Check it is running on " + BASE);
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
  news: () => call<{ news: NewsItem[] }>(token, "/news"),
  simulate: (body: { amount_gbp: number; date: string; label: string }) =>
    call<Simulation>(token, "/simulate", { method: "POST", body: JSON.stringify(body) }),
  action: (body: { warning_id: string; confirmed: boolean; amount_gbp?: number; date?: string; label?: string; weekly_gbp?: number }) =>
    call<{ forecast: Forecast; warnings: Warning[] }>(token, "/actions", { method: "POST", body: JSON.stringify(body) }),
  newsSummary: (id: string) => call<{ summary: string; source: "gemini" | "stored" }>(token, `/news/${id}/summary`),
  parseWhatIf: (text: string) =>
    call<{ label: string; amount_gbp: number | null; date: string; heard: string }>(token, "/whatif/parse", { method: "POST", body: JSON.stringify({ text }) }),
  speak: async (text: string) => {
    const res = await fetch(`${BASE}/speak`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ text: text.slice(0, 800) }),
    });
    if (!res.ok) throw new ApiError(res.status, "The voice didn't load. Try again.");
    return res.blob();
  },
  transcribe: (audio: Blob) => {
    const form = new FormData();
    form.append("file", audio, audio.type.includes("mp4") ? "voice.mp4" : "voice.webm");
    return call<{ text: string }>(token, "/transcribe", { method: "POST", body: form });
  },
  history: () => call<{ days: { date: string; balance: number }[]; lowest: { date: string; balance: number }; account: { name: string; balance_gbp: number; as_of: string } }>(token, "/history"),
  removeWhatIf: (id: number) => call<{ forecast: Forecast; warnings: Warning[] }>(token, `/whatif/${id}`, { method: "DELETE" }),
  resetActions:() => call<{ ok: boolean }>(token, "/actions", { method: "DELETE" }),
  agentLog: () => call<{ events: AgentEvent[] }>(token, "/agent-log"),
});
