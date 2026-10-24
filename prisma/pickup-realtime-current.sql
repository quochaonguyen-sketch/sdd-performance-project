-- Atomic, full-fleet snapshot owned by sdd-web-data; legacy KV5 jobs cannot overwrite it.
create table if not exists public.pickup_realtime_current (
  id smallint primary key check (id = 1),
  snapshot_id text not null,
  snapshot_at timestamptz not null,
  source_date date not null,
  inventory_snapshot_id text not null,
  inventory_snapshot_at timestamptz not null,
  task_count integer not null check (task_count > 0),
  riders jsonb not null check (jsonb_typeof(riders) = 'array' and jsonb_array_length(riders) > 0),
  groups jsonb not null check (jsonb_typeof(groups) = 'array')
);
alter table public.pickup_realtime_current enable row level security;
revoke all on public.pickup_realtime_current from public, anon, authenticated;
grant select, insert, update on public.pickup_realtime_current to service_role;
