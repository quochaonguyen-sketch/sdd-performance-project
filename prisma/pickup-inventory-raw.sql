-- TON pickup RAW + pivot (chay 1 lan tren MOI Supabase: SB1 dashboard + SB2 mirror).
-- Writer: jobs/pickup_ton_status.py (RAW_TABLE + STATUS_TABLE).
-- Hien trang: SB2 chua co 4 bang nay -> REST tra 404 PGRST205
--   "Could not find the table 'public.pickup_48h_no_api2' in the schema cache".
-- Chay trong Dashboard > SQL Editor tung project, Run 1 lan. Idempotent.

-- 1) RAW: 1 dong / tracking_id (REPLACE theo snapshot_id moi).
create table if not exists public.pickup_48h_no_api2 (
  tracking_id text primary key,
  shipment_id text default '',
  sls_tracking_number text default '',
  pickup_station_id text default '',
  pickup_station_name text default '',
  pickup_point_id text default '',
  pickup_point_name text default '',
  pickup_point_district text default '',
  full_address text default '',
  create_time text default '',
  status text default '',
  cot_group text default '',
  zone_name text default '',
  assigned_riders_today text default '',
  area text default '',
  ward text default '',
  snapshot_id text,
  snapshot_at timestamptz
);
create index if not exists pickup_48h_no_api2_snapshot_idx
  on public.pickup_48h_no_api2 (snapshot_id);
create index if not exists pickup_48h_no_api2_status_idx
  on public.pickup_48h_no_api2 (status);

-- 2) Pivot ton kho: 1 dong / (area, district, ward, zone, cot).
create table if not exists public.pickup_inventory_assigned (
  area text not null,
  district text not null,
  ward text not null,
  zone text not null,
  cot text not null,
  orders integer not null default 0,
  snapshot_id text,
  snapshot_at timestamptz,
  primary key (area, district, ward, zone, cot)
);
create table if not exists public.pickup_inventory_onhold (
  area text not null,
  district text not null,
  ward text not null,
  zone text not null,
  cot text not null,
  orders integer not null default 0,
  snapshot_id text,
  snapshot_at timestamptz,
  primary key (area, district, ward, zone, cot)
);
create table if not exists public.pickup_inventory_created (
  area text not null,
  district text not null,
  ward text not null,
  zone text not null,
  cot text not null,
  orders integer not null default 0,
  snapshot_id text,
  snapshot_at timestamptz,
  primary key (area, district, ward, zone, cot)
);
create index if not exists pickup_inventory_assigned_snapshot_idx
  on public.pickup_inventory_assigned (snapshot_id);
create index if not exists pickup_inventory_onhold_snapshot_idx
  on public.pickup_inventory_onhold (snapshot_id);
create index if not exists pickup_inventory_created_snapshot_idx
  on public.pickup_inventory_created (snapshot_id);

-- 3) Quyen + realtime (giong sql/pickup_48h_realtime.sql).
grant usage on schema public to authenticated;
grant select on public.pickup_48h_no_api2 to authenticated;
grant select on public.pickup_inventory_assigned to authenticated;
grant select on public.pickup_inventory_onhold to authenticated;
grant select on public.pickup_inventory_created to authenticated;
grant all privileges on public.pickup_48h_no_api2 to service_role;
grant all privileges on public.pickup_inventory_assigned to service_role;
grant all privileges on public.pickup_inventory_onhold to service_role;
grant all privileges on public.pickup_inventory_created to service_role;

alter table public.pickup_48h_no_api2 enable row level security;
alter table public.pickup_inventory_assigned enable row level security;
alter table public.pickup_inventory_onhold enable row level security;
alter table public.pickup_inventory_created enable row level security;

drop policy if exists "authenticated_read_pickup_48h_no_api2" on public.pickup_48h_no_api2;
create policy "authenticated_read_pickup_48h_no_api2" on public.pickup_48h_no_api2 for select to authenticated using (
  exists (
    select 1 from public.profiles p where p.id = (select auth.uid())
      and (p.role = 'admin' or coalesce(
        (select auth.jwt()) -> 'app_metadata' -> 'permissions' -> 'manage_pickup',
        to_jsonb(p.role = 'leader')
      ) = 'true'::jsonb)
  )
);
drop policy if exists "authenticated_read_pickup_inventory_assigned" on public.pickup_inventory_assigned;
create policy "authenticated_read_pickup_inventory_assigned" on public.pickup_inventory_assigned for select to authenticated using (
  exists (
    select 1 from public.profiles p where p.id = (select auth.uid())
      and (p.role = 'admin' or coalesce(
        (select auth.jwt()) -> 'app_metadata' -> 'permissions' -> 'manage_pickup',
        to_jsonb(p.role = 'leader')
      ) = 'true'::jsonb)
  )
);
drop policy if exists "authenticated_read_pickup_inventory_onhold" on public.pickup_inventory_onhold;
create policy "authenticated_read_pickup_inventory_onhold" on public.pickup_inventory_onhold for select to authenticated using (
  exists (
    select 1 from public.profiles p where p.id = (select auth.uid())
      and (p.role = 'admin' or coalesce(
        (select auth.jwt()) -> 'app_metadata' -> 'permissions' -> 'manage_pickup',
        to_jsonb(p.role = 'leader')
      ) = 'true'::jsonb)
  )
);
drop policy if exists "authenticated_read_pickup_inventory_created" on public.pickup_inventory_created;
create policy "authenticated_read_pickup_inventory_created" on public.pickup_inventory_created for select to authenticated using (
  exists (
    select 1 from public.profiles p where p.id = (select auth.uid())
      and (p.role = 'admin' or coalesce(
        (select auth.jwt()) -> 'app_metadata' -> 'permissions' -> 'manage_pickup',
        to_jsonb(p.role = 'leader')
      ) = 'true'::jsonb)
  )
);

do $$ begin alter publication supabase_realtime add table public.pickup_48h_no_api2; exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table public.pickup_inventory_assigned; exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table public.pickup_inventory_onhold; exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table public.pickup_inventory_created; exception when duplicate_object then null; end $$;

-- Bat PostgREST nap lai schema cache -> het loi PGRST205 404.
notify pgrst, 'reload schema';



revoke all on table public.pickup_48h_no_api2, public.pickup_inventory_assigned, public.pickup_inventory_onhold, public.pickup_inventory_created from anon, authenticated;
grant select on table public.pickup_48h_no_api2, public.pickup_inventory_assigned, public.pickup_inventory_onhold, public.pickup_inventory_created to authenticated;
