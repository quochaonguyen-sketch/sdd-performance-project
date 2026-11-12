create table if not exists public.lost_spx_checks (
  shipment_id text primary key,
  tracking jsonb,
  logs jsonb
);

create table if not exists public.lost_report (
  id boolean primary key default true check (id),
  rows jsonb not null default '[]'::jsonb check (jsonb_typeof(rows) = 'array'),
  synced_at timestamptz,
  report_day date,
  lease_id uuid,
  lease_until timestamptz,
  last_error text
);

insert into public.lost_report(id) values (true) on conflict do nothing;
alter table public.lost_spx_checks enable row level security;
alter table public.lost_report enable row level security;
revoke all on public.lost_spx_checks, public.lost_report from public, anon, authenticated;
grant select, insert, update on public.lost_spx_checks, public.lost_report to service_role;
notify pgrst, 'reload schema';
