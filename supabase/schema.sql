create table if not exists profiles (
  id uuid primary key references auth.users on delete cascade,
  job_type text,
  contract_type text,
  pay_frequency text,
  pay_min_gbp numeric,
  pay_max_gbp numeric,
  adults int,
  children_ages int[],
  benefits text[],
  housing text,
  area text,
  energy_payment text,
  guessed_by_ai boolean default false,
  updated_at timestamptz default now()
);

create table if not exists actions (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  warning_id text not null,
  action text not null,
  weekly_gbp numeric,
  confirmed_at timestamptz default now()
);

create table if not exists agent_events (
  id bigint generated always as identity primary key,
  user_id uuid references auth.users on delete cascade,
  tool text not null,
  reason text,
  created_at timestamptz default now()
);

alter table profiles enable row level security;
alter table actions enable row level security;
alter table agent_events enable row level security;

create policy "own profile" on profiles for all using (auth.uid() = id) with check (auth.uid() = id);
create policy "own actions" on actions for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own agent events" on agent_events for select using (auth.uid() = user_id);
