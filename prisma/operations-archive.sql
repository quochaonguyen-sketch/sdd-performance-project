-- Apply only to the separate archive project.
begin;

create table if not exists public.operations_archive_days (
  kind text not null check (kind in ('return','pickup_cot','wh','backlog_pickup','backlog_delivery')),
  report_date date not null,
  version text not null check (version <> ''),
  payload jsonb not null check (jsonb_typeof(payload) in ('array','object')),
  primary key (kind,report_date)
);

alter table public.operations_archive_days enable row level security;
revoke all on public.operations_archive_days from public,anon,authenticated;
grant select,insert,update on public.operations_archive_days to service_role;
notify pgrst, 'reload schema';
commit;
