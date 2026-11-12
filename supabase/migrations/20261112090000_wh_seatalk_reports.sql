create table if not exists public.wh_seatalk_reports (
  group_id text not null,
  report_date date not null,
  thread_id text,
  snapshot_at timestamptz,
  sent_count integer not null default 0 check (sent_count >= 0),
  awaiting_confirmation boolean not null default false,
  lease_until timestamptz,
  primary key (group_id, report_date)
);

alter table public.wh_seatalk_reports enable row level security;
revoke all on public.wh_seatalk_reports from public, anon, authenticated;
grant select, insert, update on public.wh_seatalk_reports to service_role;
