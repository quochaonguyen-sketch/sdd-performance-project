create table if not exists public.overnight_hold_rider_notes (
 cutoff_date date not null references public.overnight_hold_snapshots(cutoff_date),
 rider_code text not null check(length(rider_code) between 1 and 100),
 note text not null default '' check(length(note)<=2000),
 updated_by text, updated_at timestamptz not null default now(),
 primary key(cutoff_date,rider_code)
);
alter table public.overnight_hold_rider_notes enable row level security;
revoke all on public.overnight_hold_rider_notes from public,anon,authenticated;
grant select,insert,update on public.overnight_hold_rider_notes to service_role;
notify pgrst,'reload schema';
