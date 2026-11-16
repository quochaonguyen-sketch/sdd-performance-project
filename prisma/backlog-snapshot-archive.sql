-- Run on the Supabase archive project.
begin;

create table if not exists public.backlog_snapshots (
  id uuid primary key default gen_random_uuid(),
  source text not null check (source in ('pickup', 'delivery')),
  source_snapshot_id text not null,
  -- The referenced jobs live in the primary database.
  legacy_job_id uuid,
  source_job_id uuid,
  source_started_at timestamptz,
  source_snapshot_at timestamptz not null,
  captured_at timestamptz not null default clock_timestamp(),
  work_date date not null,
  slot_at timestamptz not null,
  total_orders bigint not null default 0 check (total_orders >= 0),
  unique (source, source_snapshot_id)
);

create index if not exists backlog_snapshots_day_idx
  on public.backlog_snapshots (source, work_date, captured_at desc);

create table if not exists public.backlog_snapshot_rows (
  snapshot_id uuid not null references public.backlog_snapshots(id),
  area text not null check (area in ('KV1', 'KV2', 'KV3', 'KV4', 'KV5')),
  district text not null,
  ward text not null,
  cot1 bigint not null check (cot1 >= 0),
  cot2 bigint not null check (cot2 >= 0),
  other bigint not null check (other >= 0),
  orders bigint not null check (orders = cot1 + cot2 + other),
  primary key (snapshot_id, area, district, ward)
);

alter table public.backlog_snapshots enable row level security;
alter table public.backlog_snapshot_rows enable row level security;
revoke all on public.backlog_snapshots, public.backlog_snapshot_rows from public, anon, authenticated;
grant select, insert, update on public.backlog_snapshots, public.backlog_snapshot_rows to service_role;
notify pgrst, 'reload schema';

commit;
