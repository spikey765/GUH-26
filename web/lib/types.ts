export type Profile = {
  job_type: string | null;
  contract_type: string | null;
  pay_frequency: string | null;
  pay_min_gbp: number | null;
  pay_max_gbp: number | null;
  adults: number | null;
  children_ages: number[];
  benefits: string[];
  housing: string | null;
  area: string | null;
  energy_payment: string | null;
  guessed_by_ai?: boolean;
};

export type ProfileField = Exclude<keyof Profile, "guessed_by_ai">;

export type Transaction = { id: string; date: string; merchant: string; amount_gbp: number; category: string };

export type Evidence = { date: string; description: string; amount_gbp: number };

export type Guess = {
  value: string | number | number[] | string[] | null;
  reason: string;
  evidence: Evidence[];
  confidence: "high" | "medium" | "low";
};

export type GuessResult = {
  guesses: Partial<Record<ProfileField, Guess>>;
  source: "gemini" | "rules";
  input: "statement" | "account";
  dropped_evidence: number;
};

export type DayPoint = { date: string; balance: number; low: number; high: number; items: { label: string; gbp: number }[] };

export type Forecast = {
  today: string;
  start_balance: number;
  tight_threshold_gbp: number;
  days: DayPoint[];
  worst_day: { date: string; balance: number };
  tight_weeks: { start: string; end: string; lowest_gbp: number }[];
  shocks?: { amount_gbp: number; date: string; label: string; weekly_gbp?: number }[];
};

export type Suggestion = {
  type: "weekly_save" | "free_help" | "info";
  title: string;
  text: string;
  weekly_gbp?: number;
  weeks?: number;
  target_gbp?: number;
  saves_gbp?: number;
  link?: string;
};

export type Warning = {
  id: string;
  title: string;
  category: string;
  effective_date: string;
  end_date: string | null;
  label: "confirmed" | "forecast" | "likely";
  source_name: string;
  source_url: string | null;
  explain: string;
  headline: string;
  cost: { kind?: string; total_gbp?: number; monthly_gbp?: number; detail?: string };
  good_news: boolean;
  history: { date: string; change: string }[];
  matched_transactions: Transaction[];
  suggestion: Suggestion;
  in_window: boolean;
  days_away: number;
  confirmed: boolean;
};

export type Simulation = {
  shock: { amount_gbp: number; date: string; label: string };
  before: { worst_day: { date: string; balance: number } };
  forecast: Forecast;
  suggestion: { weekly_gbp: number; weeks: number; worst_after_saving: { date: string; balance: number } };
};

export type AgentEvent = { tool: string; reason: string; created_at: string };
