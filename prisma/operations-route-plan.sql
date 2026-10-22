-- Apply after riders, pickup-assignments.sql and activity_logs exist.
-- Server-only atomic updates; a stale preview rolls back the entire batch.
create or replace function public.apply_operations_route_plan(p_actor uuid, p_changes jsonb)
returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare
  item jsonb;
  current_row jsonb;
  changed integer := 0;
  rider_next public.riders;
  pickup_next public.pickup_assignments;
begin
  if not exists (select 1 from public.profiles where id = p_actor) then
    raise exception 'Profile does not exist';
  end if;
  if jsonb_typeof(p_changes) <> 'array' or jsonb_array_length(p_changes) > 10000 then
    raise exception 'Invalid route plan';
  end if;
  for item in select value from jsonb_array_elements(p_changes) order by value->>'tab', value->>'key' loop
    if item->>'tab' = 'TUYEN_RIDER' then
      if exists (select 1 from jsonb_object_keys(item->'after') f where f not in ('full_name','kv','cot','home_district','pickup_district','pickup_ward','point_name','delivery_district','delivery_ward','status')) then
        raise exception 'Invalid rider field';
      end if;
      select to_jsonb(r) into current_row from public.riders r where r.rider_code = item->>'key' for update;
    elsif item->>'tab' = 'TUYEN_PICKUP' then
      if exists (select 1 from jsonb_object_keys(item->'after') f where f not in ('route_name','cot','mapped_pickup_point_group','ward','district')) then
        raise exception 'Invalid pickup field';
      end if;
      select to_jsonb(p) into current_row from public.pickup_assignments p where p.assignment_key = item->>'key' for update;
    else
      raise exception 'Invalid tab';
    end if;
    if current_row is null then raise exception 'Missing record: %', item->>'key'; end if;
    if exists (select 1 from jsonb_each(item->'before') b where coalesce(current_row->b.key, 'null'::jsonb) is distinct from b.value) then
      raise exception 'Record changed after preview: %', item->>'key';
    end if;
    if item->>'tab' = 'TUYEN_RIDER' then
      rider_next := jsonb_populate_record(null::public.riders, current_row || (item->'after'));
      update public.riders set full_name=rider_next.full_name,
        name=case when (item->'after') ? 'full_name' then rider_next.full_name else name end,
        kv=rider_next.kv, cot=rider_next.cot, home_district=rider_next.home_district,
        pickup_district=rider_next.pickup_district, pickup_ward=rider_next.pickup_ward,
        point_name=rider_next.point_name, delivery_district=rider_next.delivery_district,
        delivery_ward=rider_next.delivery_ward, status=rider_next.status, updated_at=now()
      where rider_code=item->>'key';
    else
      pickup_next := jsonb_populate_record(null::public.pickup_assignments, current_row || (item->'after'));
      update public.pickup_assignments set route_name=pickup_next.route_name, cot=pickup_next.cot,
        mapped_pickup_point_group=pickup_next.mapped_pickup_point_group,
        ward=pickup_next.ward, district=pickup_next.district, updated_at=now()
      where assignment_key=item->>'key';
    end if;
    changed := changed + 1;
  end loop;
  insert into public.activity_logs(entity_type, action, message, raw_data)
  values ('route_plan', 'synced', format('Updated %s route records', changed), jsonb_build_object('actor',p_actor,'changes',p_changes));
  return changed;
end;
$$;
revoke all on function public.apply_operations_route_plan(uuid,jsonb) from public, anon, authenticated;
grant execute on function public.apply_operations_route_plan(uuid,jsonb) to service_role;
