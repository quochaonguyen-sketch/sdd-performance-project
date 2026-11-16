-- Run on the Supabase archive project after backlog-snapshot-archive.sql.
begin;

create or replace function public.write_backlog_archive_pivot(p_snapshot jsonb, p_rows jsonb)
returns bigint language plpgsql security definer set search_path = pg_catalog as $$
declare snap public.backlog_snapshots; stored_id uuid; total bigint;
begin
  select * into snap from jsonb_populate_record(null::public.backlog_snapshots, p_snapshot);
  insert into public.backlog_snapshots select snap.*
    on conflict (source, source_snapshot_id) do update set total_orders = excluded.total_orders
    returning id into stored_id;
  if stored_id is distinct from snap.id then
    raise exception 'Backlog snapshot ID mismatch';
  end if;
  delete from public.backlog_snapshot_rows where snapshot_id = stored_id;
  insert into public.backlog_snapshot_rows
    select stored_id, r.area, r.district, r.ward, r.cot1, r.cot2, r.other, r.orders
      from jsonb_populate_recordset(null::public.backlog_snapshot_rows, p_rows) r;
  select coalesce(sum(orders), 0) into total from public.backlog_snapshot_rows where snapshot_id = stored_id;
  if total is distinct from snap.total_orders then
    raise exception 'Backlog pivot total mismatch';
  end if;
  return total;
end;
$$;

create or replace function public.read_backlog_archive_pivots(p_ids uuid[], p_by_area boolean)
returns jsonb language sql stable set search_path = pg_catalog as $$
  with rows as (
    select * from public.backlog_snapshot_rows where snapshot_id = any(p_ids)
  ), groups as (
    select snapshot_id, jsonb_agg(to_jsonb(a) - 'snapshot_id' order by area) as items
    from (
      select snapshot_id, area, sum(cot1) as cot1, sum(cot2) as cot2,
        sum(other) as other, sum(orders) as orders
      from rows where p_by_area group by snapshot_id, area
    ) a group by snapshot_id
    union all
    select snapshot_id, jsonb_agg(to_jsonb(r) - 'snapshot_id' order by area, district, ward)
    from rows r where not p_by_area group by snapshot_id
  )
  select coalesce(jsonb_object_agg(snapshot_id, items), '{}'::jsonb) from groups;
$$;

create or replace function public.read_backlog_archive_manifest(p_prefix text)
returns jsonb language sql stable set search_path = pg_catalog as $$
  select coalesce(jsonb_object_agg(snapshot_id, jsonb_build_array(row_count, digest)), '{}'::jsonb)
  from (
    select snapshot_id, count(*) as row_count,
      md5(jsonb_agg(to_jsonb(r) order by area collate "C", district collate "C", ward collate "C")::text) as digest
    from public.backlog_snapshot_rows r
    where snapshot_id between (p_prefix || repeat('0', 31))::uuid and (p_prefix || repeat('f', 31))::uuid
    group by snapshot_id
  ) manifest;
$$;

revoke all on function public.write_backlog_archive_pivot(jsonb, jsonb),
  public.read_backlog_archive_pivots(uuid[], boolean), public.read_backlog_archive_manifest(text)
  from public, anon, authenticated;
grant execute on function public.write_backlog_archive_pivot(jsonb, jsonb),
  public.read_backlog_archive_pivots(uuid[], boolean), public.read_backlog_archive_manifest(text)
  to service_role;

notify pgrst, 'reload schema';
commit;
