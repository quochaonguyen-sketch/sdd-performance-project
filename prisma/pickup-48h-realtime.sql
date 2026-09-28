-- Pickup Realtime tables used by /pickup-realtime
-- Run once in Supabase SQL Editor of the KV1-KV6 project.
-- After this, point the pickup48h job at this project so it can REPLACE snapshots.

create table if not exists public.pickup_48h_summary_groups (
  id bigint generated always as identity primary key,
  snapshot_id text not null,
  snapshot_at timestamptz,
  khu_vuc text,
  ward text,
  cot text,
  area text,
  route_area text,
  assign_orders integer not null default 0,
  picked_orders integer not null default 0,
  onhold_orders integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists pickup_48h_summary_groups_snapshot_idx
  on public.pickup_48h_summary_groups (snapshot_id, area, route_area);

create table if not exists public.pickup_48h_realtime_riders (
  id bigint generated always as identity primary key,
  snapshot_id text not null,
  driver_id text not null,
  driver_name text,
  area text,
  zones text,
  total_pickup_quantity integer not null default 0,
  pickup_point_count integer not null default 0,
  assigned_orders integer not null default 0,
  onhold_orders integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists pickup_48h_realtime_riders_snapshot_idx
  on public.pickup_48h_realtime_riders (snapshot_id, area);

create unique index if not exists pickup_48h_realtime_riders_snapshot_driver_idx
  on public.pickup_48h_realtime_riders (snapshot_id, driver_id);

create table if not exists public.pickup_48h_rider_groups (
  id bigint generated always as identity primary key,
  snapshot_id text not null,
  driver_id text not null,
  khu_vuc text,
  ward text,
  ward_area text,
  assigned_orders integer not null default 0,
  picked_orders integer not null default 0,
  onhold_orders integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists pickup_48h_rider_groups_snapshot_idx
  on public.pickup_48h_rider_groups (snapshot_id, driver_id);

alter table public.pickup_48h_summary_groups enable row level security;
alter table public.pickup_48h_realtime_riders enable row level security;
alter table public.pickup_48h_rider_groups enable row level security;

drop policy if exists "authenticated_read_pickup_48h_summary_groups" on public.pickup_48h_summary_groups;
create policy "authenticated_read_pickup_48h_summary_groups"
  on public.pickup_48h_summary_groups for select to authenticated using (true);

drop policy if exists "authenticated_read_pickup_48h_realtime_riders" on public.pickup_48h_realtime_riders;
create policy "authenticated_read_pickup_48h_realtime_riders"
  on public.pickup_48h_realtime_riders for select to authenticated using (true);

drop policy if exists "authenticated_read_pickup_48h_rider_groups" on public.pickup_48h_rider_groups;
create policy "authenticated_read_pickup_48h_rider_groups"
  on public.pickup_48h_rider_groups for select to authenticated using (true);

grant usage on schema public to authenticated;
grant select on table public.pickup_48h_summary_groups to authenticated;
grant select on table public.pickup_48h_realtime_riders to authenticated;
grant select on table public.pickup_48h_rider_groups to authenticated;

grant all privileges on table public.pickup_48h_summary_groups to service_role;
grant all privileges on table public.pickup_48h_realtime_riders to service_role;
grant all privileges on table public.pickup_48h_rider_groups to service_role;

do $$
begin
  alter publication supabase_realtime add table public.pickup_48h_summary_groups;
exception when duplicate_object then null;
end;
$$;

do $$
begin
  alter publication supabase_realtime add table public.pickup_48h_realtime_riders;
exception when duplicate_object then null;
end;
$$;

do $$
begin
  alter publication supabase_realtime add table public.pickup_48h_rider_groups;
exception when duplicate_object then null;
end;
$$;
