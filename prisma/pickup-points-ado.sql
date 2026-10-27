alter table public.pickup_assignments add column if not exists station_id text;
alter table public.pickup_assignments add column if not exists last_synced_at timestamptz;
create index if not exists pickup_assignments_station_point_idx on public.pickup_assignments(station_id,pickup_point_id);
create table if not exists public.pickup_shop_volume_days (
 station_id text not null, report_date date not null, input_orders integer not null check(input_orders>=0),
 unmapped_orders integer not null check(unmapped_orders>=0 and unmapped_orders<=input_orders),
 synced_at timestamptz not null default now(), primary key(station_id,report_date)
);
create table if not exists public.pickup_shop_volume_daily (
 station_id text not null, report_date date not null, pickup_point_id text not null,
 total_orders integer not null check(total_orders>0), primary key(station_id,report_date,pickup_point_id),
 foreign key(station_id,report_date) references public.pickup_shop_volume_days on delete cascade
);
alter table public.pickup_shop_volume_days enable row level security;
alter table public.pickup_shop_volume_daily enable row level security;
revoke all on public.pickup_shop_volume_days,public.pickup_shop_volume_daily from public,anon,authenticated;
grant select,insert,update,delete on public.pickup_shop_volume_days,public.pickup_shop_volume_daily to service_role;

create or replace function public.sync_pickup_point_catalog(p_station text,p_rows jsonb)
returns integer language plpgsql security invoker set search_path=pg_catalog as $$
declare n integer;
begin
 if nullif(p_station,'') is null or jsonb_typeof(p_rows) is distinct from 'array' then raise exception 'Invalid PUP snapshot'; end if;
 n:=jsonb_array_length(p_rows);
 if n=0 or n>500 or exists(select 1 from jsonb_array_elements(p_rows) r where r->>'station_id' is distinct from p_station
  or nullif(r->>'pickup_point_id','') is null or nullif(r->>'shop_name','') is null or nullif(r->>'shop_address','') is null)
  or (select count(distinct r->>'pickup_point_id') from jsonb_array_elements(p_rows) r)<>n then raise exception 'Invalid PUP row'; end if;
 insert into public.pickup_assignments(assignment_key,pickup_point_id,pup_code,shop_name,shop_address,ward,district,route_name,mapped_pickup_point_group,station_id,last_synced_at)
 select 'catalog:'||p_station||':'||r.pickup_point_id,r.pickup_point_id,r.pup_code,r.shop_name,r.shop_address,r.ward,r.district,r.route_name,r.mapped_pickup_point_group,p_station,now()
 from jsonb_populate_recordset(null::public.pickup_assignments,p_rows) r
 on conflict(assignment_key) do update set pup_code=excluded.pup_code,shop_name=excluded.shop_name,shop_address=excluded.shop_address,
 ward=excluded.ward,district=excluded.district,route_name=excluded.route_name,mapped_pickup_point_group=excluded.mapped_pickup_point_group,
 station_id=excluded.station_id,last_synced_at=excluded.last_synced_at;
 return n;
end $$;

create or replace function public.publish_pickup_shop_volume(p_station text,p_day date,p_rows jsonb,p_input integer,p_unmapped integer)
returns integer language plpgsql security invoker set search_path=pg_catalog as $$
declare n integer; total bigint;
begin
 if nullif(p_station,'') is null or p_day is null or p_day>(now() at time zone 'Asia/Ho_Chi_Minh')::date
   or jsonb_typeof(p_rows) is distinct from 'array' or p_input is null or p_unmapped is null or p_unmapped<0 or p_input<p_unmapped then raise exception 'Invalid shop volume'; end if;
 perform pg_advisory_xact_lock(hashtext('pickup-shop:'||p_station||':'||p_day));
 n:=jsonb_array_length(p_rows);
 if exists(select 1 from jsonb_array_elements(p_rows) r where nullif(r->>'pickup_point_id','') is null or coalesce((r->>'total_orders')::int,0)<=0)
  or (select count(distinct r->>'pickup_point_id') from jsonb_array_elements(p_rows) r)<>n then raise exception 'Invalid shop counter'; end if;
 select coalesce(sum((r->>'total_orders')::int),0) into total from jsonb_array_elements(p_rows) r;
 if total+p_unmapped<>p_input then raise exception 'Shop volume does not reconcile'; end if;
 insert into public.pickup_shop_volume_days(station_id,report_date,input_orders,unmapped_orders) values(p_station,p_day,p_input,p_unmapped)
 on conflict(station_id,report_date) do update set input_orders=excluded.input_orders,unmapped_orders=excluded.unmapped_orders,synced_at=now();
 delete from public.pickup_shop_volume_daily where station_id=p_station and report_date=p_day;
 insert into public.pickup_shop_volume_daily select p_station,p_day,r->>'pickup_point_id',(r->>'total_orders')::int from jsonb_array_elements(p_rows) r;
 return n;
end $$;

create or replace function public.pickup_shop_ado(p_station text)
returns jsonb language sql stable security invoker set search_path=pg_catalog as $$
 with bounds as (select (now() at time zone 'Asia/Ho_Chi_Minh')::date-30 as first_day,(now() at time zone 'Asia/Ho_Chi_Minh')::date-1 as last_day),
 valid_days as (select report_date from public.pickup_shop_volume_days,bounds where station_id=p_station and report_date between first_day and last_day and unmapped_orders=0),
 coverage as (select count(*)::int as days from valid_days),
 totals as (select d.pickup_point_id,sum(d.total_orders) as total from public.pickup_shop_volume_daily d join valid_days v using(report_date) where d.station_id=p_station group by d.pickup_point_id)
 select jsonb_build_object('days',coverage.days,'requiredDays',30,'start',bounds.first_day,'end',bounds.last_day,
 'shops',coalesce((select jsonb_agg(jsonb_build_object('pickup_point_id',pickup_point_id,'orders',total,'ado',case when coverage.days>0 then ceil(total/coverage.days::numeric) else null end)) from totals),'[]'::jsonb)) from bounds,coverage;
$$;
revoke all on function public.sync_pickup_point_catalog(text,jsonb),public.publish_pickup_shop_volume(text,date,jsonb,integer,integer),public.pickup_shop_ado(text) from public,anon,authenticated;
grant execute on function public.sync_pickup_point_catalog(text,jsonb),public.publish_pickup_shop_volume(text,date,jsonb,integer,integer),public.pickup_shop_ado(text) to service_role;
notify pgrst,'reload schema';

create or replace function public.pickup_points_page(p_station text,p_query text,p_route text,p_page integer,p_size integer,p_sort text)
returns jsonb language sql stable security invoker set search_path=pg_catalog as $$
 with valid_days as (select report_date from public.pickup_shop_volume_days where station_id=p_station and unmapped_orders=0
   and report_date between (now() at time zone 'Asia/Ho_Chi_Minh')::date-30 and (now() at time zone 'Asia/Ho_Chi_Minh')::date-1),
 coverage as (select count(*)::int as days from valid_days),
 volumes as (select d.pickup_point_id,sum(d.total_orders) as orders from public.pickup_shop_volume_daily d join valid_days v using(report_date) where d.station_id=p_station group by d.pickup_point_id),
 scoped as (select a.id,a.assignment_key,a.assigned_at,a.last_synced_at,a.cot,a.route_name,a.mapped_pickup_point_group,a.pickup_point_id,a.pup_code,a.shop_name,a.shop_address,a.ward,a.district,a.pickup_status,a.pickup_retry_assign_type,coalesce(v.orders,0) as ado_orders,coverage.days as ado_days,case when coverage.days>0 then ceil(coalesce(v.orders,0)/coverage.days::numeric) else null end as ado
  from public.pickup_assignments a cross join coverage left join volumes v on v.pickup_point_id=a.pickup_point_id where a.station_id=p_station or a.station_id is null),
 filtered as (select * from scoped where (p_route='all' or coalesce(nullif(btrim(route_name),''),'Chưa có tuyến')=p_route)
  and (p_query='' or position(lower(p_query) in lower(concat_ws(' ',pickup_point_id,pup_code,shop_name,shop_address,ward,district,route_name,cot)))>0)),
 routes as (select coalesce(nullif(btrim(route_name),''),'Chưa có tuyến') as route,count(*)::int as count,'Pickup Points' as helper from scoped group by 1)
 select jsonb_build_object('ado_days',(select days from coverage),'total',(select count(*) from scoped),'filtered',(select count(*) from filtered),
 'routes',coalesce((select jsonb_agg(r order by count desc,route) from routes r),'[]'::jsonb),
 'rows',coalesce((select jsonb_agg(r) from (select * from filtered order by case when p_sort='ado_desc' then ado_orders end desc nulls last,route_name nulls last,pickup_point_id,id limit greatest(1,least(p_size,1000)) offset greatest(0,p_page-1)*greatest(1,least(p_size,1000))) r),'[]'::jsonb));
$$;
revoke all on function public.pickup_points_page(text,text,text,integer,integer,text) from public,anon,authenticated;
grant execute on function public.pickup_points_page(text,text,text,integer,integer,text) to service_role;

create or replace function public.pickup_points_page(p_station text,p_query text,p_route text,p_page integer,p_size integer)
returns jsonb language sql stable security invoker set search_path=pg_catalog as $$
 select public.pickup_points_page(p_station,p_query,p_route,p_page,p_size,'route');
$$;
revoke all on function public.pickup_points_page(text,text,text,integer,integer) from public,anon,authenticated;
grant execute on function public.pickup_points_page(text,text,text,integer,integer) to service_role;
notify pgrst,'reload schema';
