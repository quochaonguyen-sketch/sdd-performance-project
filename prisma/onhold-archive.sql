-- Apply only to the separate Supabase project that serves finalized OH reports.
begin;

create table if not exists public.onhold_archive_days (
  report_date date primary key,
  fetched_at timestamptz not null,
  finalized_at timestamptz not null,
  payload jsonb not null
);

alter table public.onhold_archive_days enable row level security;
revoke all on public.onhold_archive_days from public, anon, authenticated;
grant select, insert, update on public.onhold_archive_days to service_role;

create or replace function public.publish_onhold_archive_day(p_day date, p_fetched_at timestamptz, p_finalized_at timestamptz, p_payload jsonb)
returns void language sql security invoker set search_path = pg_catalog as $$
  insert into public.onhold_archive_days as archive (report_date, fetched_at, finalized_at, payload)
  values (p_day, p_fetched_at, p_finalized_at, p_payload)
  on conflict (report_date) do update
    set fetched_at = excluded.fetched_at, finalized_at = excluded.finalized_at, payload = excluded.payload
    where (archive.fetched_at, archive.finalized_at) < (excluded.fetched_at, excluded.finalized_at);
$$;

revoke all on function public.publish_onhold_archive_day(date,timestamptz,timestamptz,jsonb) from public, anon, authenticated;
grant execute on function public.publish_onhold_archive_day(date,timestamptz,timestamptz,jsonb) to service_role;
notify pgrst, 'reload schema';
commit;
