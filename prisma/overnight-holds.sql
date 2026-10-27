-- Overnight hold orders schema, capture at 23h and continuous status tracking
create table if not exists public.overnight_hold_snapshots (
  cutoff_date date primary key,
  captured_at timestamptz not null default now(),
  total_orders integer not null default 0,
  delivering_count integer not null default 0,
  onhold_count integer not null default 0,
  rider_count integer not null default 0,
  resolved_count integer not null default 0,
  status text not null default 'locked',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.overnight_hold_orders (
  id uuid primary key default gen_random_uuid(),
  cutoff_date date not null references public.overnight_hold_snapshots(cutoff_date) on delete cascade,
  order_key text not null,
  order_code text not null,
  area text not null,
  district text not null default '',
  ward text not null default '',
  rider_code text not null default '',
  rider_name text not null default '',
  cutoff_status smallint not null default 1, -- 1: Delivering, 5: Onhold
  current_status text not null default 'Delivering', -- Delivering, Onhold, Delivered, Returned
  reason text not null default '',
  reason_label text not null default '',
  note text not null default '',
  note_updated_at timestamptz,
  note_updated_by text,
  last_synced_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint overnight_hold_orders_date_order_key unique (cutoff_date, order_code)
);

create index if not exists idx_overnight_hold_orders_filter
  on public.overnight_hold_orders (cutoff_date, area, current_status);
create index if not exists idx_overnight_hold_orders_code
  on public.overnight_hold_orders (order_code);
create index if not exists idx_overnight_hold_orders_rider
  on public.overnight_hold_orders (rider_code);

alter table public.overnight_hold_snapshots enable row level security;
alter table public.overnight_hold_orders enable row level security;

drop policy if exists "Authenticated users can read overnight hold snapshots" on public.overnight_hold_snapshots;
create policy "Authenticated users can read overnight hold snapshots"
  on public.overnight_hold_snapshots for select to authenticated using (true);

drop policy if exists "Authenticated users can read overnight hold orders" on public.overnight_hold_orders;
create policy "Authenticated users can read overnight hold orders"
  on public.overnight_hold_orders for select to authenticated using (true);

drop policy if exists "Authenticated users can update overnight hold orders" on public.overnight_hold_orders;
create policy "Authenticated users can update overnight hold orders"
  on public.overnight_hold_orders for update to authenticated using (true) with check (true);

grant select on public.overnight_hold_snapshots to authenticated;
grant select, update on public.overnight_hold_orders to authenticated;
grant all privileges on public.overnight_hold_snapshots to service_role;
grant all privileges on public.overnight_hold_orders to service_role;

-- Capture / Lock 23h overnight holds from onhold_daily_orders
create or replace function public.capture_overnight_hold(p_day date, p_actor text default null)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare
  v_total integer := 0;
  v_delivering integer := 0;
  v_onhold integer := 0;
  v_riders integer := 0;
  v_source_count integer := 0;
begin
  select count(*) into v_source_count
  from public.onhold_daily_orders
  where report_date = p_day and status in (1, 5);

  -- Upsert snapshot header
  insert into public.overnight_hold_snapshots (cutoff_date, captured_at, status, updated_at)
  values (p_day, now(), 'locked', now())
  on conflict (cutoff_date) do update
    set captured_at = now(), updated_at = now();

  -- Insert orders from onhold_daily_orders preserving existing notes
  insert into public.overnight_hold_orders (
    cutoff_date, order_key, order_code, area, district, ward,
    rider_code, rider_name, cutoff_status, current_status,
    reason, reason_label, last_synced_at
  )
  select
    p_day,
    o.order_key,
    o.order_code,
    o.area,
    o.district,
    o.ward,
    o.rider_code,
    o.rider_name,
    o.status,
    case when o.status = 1 then 'Delivering' else 'Onhold' end,
    o.reason,
    o.reason_label,
    now()
  from public.onhold_daily_orders o
  where o.report_date = p_day and o.status in (1, 5)
  on conflict (cutoff_date, order_code) do update set
    area = excluded.area,
    district = excluded.district,
    ward = excluded.ward,
    rider_code = excluded.rider_code,
    rider_name = excluded.rider_name,
    current_status = case
      when overnight_hold_orders.current_status in ('Delivered', 'Returned') then overnight_hold_orders.current_status
      else excluded.current_status
    end,
    reason = excluded.reason,
    reason_label = excluded.reason_label,
    last_synced_at = now(),
    updated_at = now();

  -- Calculate summary stats
  select
    count(*),
    count(*) filter (where cutoff_status = 1),
    count(*) filter (where cutoff_status = 5),
    count(distinct rider_code),
    count(*) filter (where current_status in ('Delivered', 'Returned'))
  into v_total, v_delivering, v_onhold, v_riders
  from public.overnight_hold_orders
  where cutoff_date = p_day;

  update public.overnight_hold_snapshots
  set
    total_orders = v_total,
    delivering_count = v_delivering,
    onhold_count = v_onhold,
    rider_count = v_riders,
    resolved_count = (select count(*) from public.overnight_hold_orders where cutoff_date = p_day and current_status in ('Delivered', 'Returned')),
    updated_at = now()
  where cutoff_date = p_day;

  return jsonb_build_object(
    'success', true,
    'cutoff_date', p_day,
    'total_orders', v_total,
    'delivering_count', v_delivering,
    'onhold_count', v_onhold,
    'rider_count', v_riders
  );
end $$;

-- Continuously update status of overnight hold orders from current inventory & onhold scans
create or replace function public.sync_overnight_hold_status(p_day date)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare
  today_date date := (now() at time zone 'Asia/Ho_Chi_Minh')::date;
  v_updated integer := 0;
  v_resolved integer := 0;
begin
  -- 1. Check if orders still active in today's onhold_daily_orders
  update public.overnight_hold_orders h
  set
    current_status = case when o.status = 1 then 'Delivering' when o.status = 5 then 'Onhold' else h.current_status end,
    reason = o.reason,
    reason_label = o.reason_label,
    rider_code = case when nullif(o.rider_code, '') is not null then o.rider_code else h.rider_code end,
    rider_name = case when nullif(o.rider_name, '') is not null then o.rider_name else h.rider_name end,
    last_synced_at = now(),
    updated_at = now()
  from public.onhold_daily_orders o
  where h.cutoff_date = p_day
    and o.report_date = today_date
    and o.order_code = h.order_code;

  -- 2. Check if orders returned to hub (lmhub_inventory_rows)
  update public.overnight_hold_orders h
  set
    current_status = 'Returned',
    last_synced_at = now(),
    updated_at = now()
  where h.cutoff_date = p_day
    and h.current_status not in ('Returned', 'Delivered')
    and exists (
      select 1 from public.lmhub_inventory_rows inv
      where inv.shipment_id = h.order_code
    );

  -- 3. Check if orders converted to return orders (return_order_snapshots)
  update public.overnight_hold_orders h
  set
    current_status = 'Returned',
    last_synced_at = now(),
    updated_at = now()
  where h.cutoff_date = p_day
    and h.current_status not in ('Returned', 'Delivered')
    and exists (
      select 1 from public.return_order_snapshots ret
      where ret.shipment_id = h.order_code
    );

  -- 4. For past dates: if today is past cutoff_date, and order is no longer in today's onhold_daily_orders or lmhub_inventory, mark Delivered
  if today_date > p_day then
    update public.overnight_hold_orders h
    set
      current_status = 'Delivered',
      last_synced_at = now(),
      updated_at = now()
    where h.cutoff_date = p_day
      and h.current_status in ('Delivering', 'Onhold')
      and not exists (
        select 1 from public.onhold_daily_orders o
        where o.report_date = today_date and o.order_code = h.order_code
      )
      and not exists (
        select 1 from public.lmhub_inventory_rows inv
        where inv.shipment_id = h.order_code
      );
  end if;

  -- Update resolved count in snapshot
  select count(*) into v_resolved
  from public.overnight_hold_orders
  where cutoff_date = p_day and current_status in ('Delivered', 'Returned');

  update public.overnight_hold_snapshots
  set resolved_count = v_resolved, updated_at = now()
  where cutoff_date = p_day;

  return jsonb_build_object(
    'success', true,
    'cutoff_date', p_day,
    'resolved_count', v_resolved
  );
end $$;

-- Update note for a specific overnight hold order
create or replace function public.update_overnight_hold_note(p_id uuid, p_note text, p_actor text default null)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare
  v_row public.overnight_hold_orders;
begin
  update public.overnight_hold_orders
  set
    note = coalesce(p_note, ''),
    note_updated_at = now(),
    note_updated_by = coalesce(p_actor, 'user'),
    updated_at = now()
  where id = p_id
  returning * into v_row;

  if not found then
    return jsonb_build_object('success', false, 'error', 'Không tìm thấy đơn hàng');
  end if;

  return jsonb_build_object(
    'success', true,
    'id', v_row.id,
    'note', v_row.note,
    'note_updated_at', v_row.note_updated_at,
    'note_updated_by', v_row.note_updated_by
  );
end $$;

-- Schedule cron at 23:00 VN (16:00 UTC) if pg_cron is available
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    begin
      perform cron.unschedule('sdd-overnight-hold-23h');
    exception when others then
      -- ignore if not found
    end;
    perform cron.schedule(
      'sdd-overnight-hold-23h',
      '0 16 * * *',
      'select public.capture_overnight_hold((now() at time zone ''Asia/Ho_Chi_Minh'')::date, ''system_cron'');'
    );
  end if;
end $$;

notify pgrst, 'reload schema';
