create table if not exists public.team_shift_templates (
  id uuid primary key default gen_random_uuid(), name text not null check(length(name) between 1 and 100),
  start_minute integer not null check(start_minute between 0 and 1439),
  end_minute integer not null check(end_minute between 0 and 1440),
  fte_breaks jsonb not null default '[]' check(jsonb_typeof(fte_breaks)='array'),
  bpo_breaks jsonb not null default '[]' check(jsonb_typeof(bpo_breaks)='array'),
  active boolean not null default true,note text not null default '',
  created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
  check(mod(end_minute-start_minute+1440,1440) between 60 and 720)
);
create table if not exists public.team_staffing_targets (
  id uuid primary key default gen_random_uuid(),area text not null check(area in ('KV1','KV2','KV3','KV4','KV5','KV6','SPF')),
  pool text not null check(pool in ('OPS','FTE','BPO')),
  day_key text not null check(day_key ~ '^([0-6]|[0-9]{4}-[0-9]{2}-[0-9]{2})$'),
  hour integer not null check(hour between 0 and 23),required numeric(6,2) not null check(required between 0 and 100),
  created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
  unique(area,pool,day_key,hour)
);
alter table public.team_staff_shifts add column if not exists template_id uuid references public.team_shift_templates(id) on delete restrict;
create index if not exists team_staff_shifts_template_idx on public.team_staff_shifts(template_id) where template_id is not null;
alter table public.team_shift_templates enable row level security;
alter table public.team_staffing_targets enable row level security;
revoke all on public.team_shift_templates,public.team_staffing_targets from public,anon,authenticated;
grant select,insert,update,delete on public.team_shift_templates,public.team_staffing_targets to service_role;
drop trigger if exists guard_team_shift_templates on public.team_shift_templates;
create trigger guard_team_shift_templates before insert or update or delete on public.team_shift_templates for each row execute function ops_private.guard_team_staff();
drop trigger if exists audit_user_changes on public.team_shift_templates;
create trigger audit_user_changes after insert or update or delete on public.team_shift_templates for each row execute function ops_private.audit_user_change();
drop trigger if exists guard_team_staffing_targets on public.team_staffing_targets;
create trigger guard_team_staffing_targets before insert or update or delete on public.team_staffing_targets for each row execute function ops_private.guard_team_staff();
drop trigger if exists audit_user_changes on public.team_staffing_targets;
create trigger audit_user_changes after insert or update or delete on public.team_staffing_targets for each row execute function ops_private.audit_user_change();

-- Source break windows are planning assumptions and editable, not attendance facts.
insert into public.team_shift_templates(id,name,start_minute,end_minute,fte_breaks,bpo_breaks,note) values
('bb57425a-10a0-4000-8000-000000000001','Ca 04:00–13:00',240,780,'[]','[]','Chưa cấu hình giờ nghỉ.'),
('bb57425a-10a0-4000-8000-000000000002','Ca 05:00–14:00',300,840,'[]','[]','Chưa cấu hình giờ nghỉ.'),
('bb57425a-10a0-4000-8000-000000000003','Ca 07:00–16:00',420,960,'[{"start":360,"end":420}]','[{"start":180,"end":240}]','Theo khung nghỉ trong CSV.'),
('bb57425a-10a0-4000-8000-000000000004','Ca 08:00–17:00',480,1020,'[]','[]','Chưa cấu hình giờ nghỉ.'),
('bb57425a-10a0-4000-8000-000000000005','Ca 09:00–18:00',540,1080,'[{"start":300,"end":360}]','[{"start":240,"end":300}]','Theo khung nghỉ trong CSV.'),
('bb57425a-10a0-4000-8000-000000000006','Ca 10:00–19:00',600,1140,'[]','[]','Chưa cấu hình giờ nghỉ.'),
('bb57425a-10a0-4000-8000-000000000007','Ca 11:00–20:00 · nghỉ đợt 1',660,1200,'[{"start":240,"end":300}]','[{"start":210,"end":270}]','FTE mô phỏng nghỉ 15–16h; có thể chọn ca nghỉ đợt 2. BPO nghỉ 14:30–15:30.'),
('bb57425a-10a0-4000-8000-000000000008','Ca 12:00–21:00',720,1260,'[]','[]','Chưa cấu hình giờ nghỉ.'),
('bb57425a-10a0-4000-8000-000000000009','Ca 13:00–22:00',780,1320,'[{"start":300,"end":360}]','[{"start":300,"end":360}]','Theo khung nghỉ trong CSV.'),
('bb57425a-10a0-4000-8000-000000000010','Ca 14:00–23:00',840,1380,'[{"start":240,"end":300}]','[{"start":240,"end":300}]','Theo khung nghỉ trong CSV.'),
('bb57425a-10a0-4000-8000-000000000011','Ca 11:00–20:00 · nghỉ đợt 2',660,1200,'[{"start":360,"end":420}]','[{"start":210,"end":270}]','FTE mô phỏng nghỉ 17–18h, mỗi người một đợt nghỉ.')
on conflict(id) do nothing;

create or replace function public.save_team_staffing_targets(items jsonb)
returns void language plpgsql security invoker set search_path=pg_catalog as $fn$
begin
  if jsonb_typeof(items) <> 'array' or jsonb_array_length(items) not between 1 and 168 then raise exception 'Danh sách định biên không hợp lệ'; end if;
  insert into public.team_staffing_targets(area,pool,day_key,hour,required)
  select x.area,x.pool,x.day_key,x.hour,x.required from jsonb_to_recordset(items) as x(area text,pool text,day_key text,hour integer,required numeric)
  on conflict(area,pool,day_key,hour) do update set required=excluded.required where team_staffing_targets.required is distinct from excluded.required;
end $fn$;
revoke all on function public.save_team_staffing_targets(jsonb) from public,anon,authenticated;
grant execute on function public.save_team_staffing_targets(jsonb) to service_role;

create or replace function public.team_planning_settings(first_day date,last_day date)
returns jsonb language sql stable security invoker set search_path=pg_catalog as $fn$
  select jsonb_build_object(
    'templates',(select coalesce(jsonb_agg(to_jsonb(t) order by t.start_minute,t.id),'[]') from public.team_shift_templates t),
    'targets',(select coalesce(jsonb_agg(to_jsonb(t)),'[]') from public.team_staffing_targets t where length(t.day_key)=1 or t.day_key between first_day::text and last_day::text),
    'template_version',(select md5(coalesce(string_agg(id::text||updated_at::text,',' order by id),'')) from public.team_shift_templates),
    'target_version',(select md5(coalesce(string_agg(id::text||updated_at::text,',' order by id),'')) from public.team_staffing_targets)
  );
$fn$;
revoke all on function public.team_planning_settings(date,date) from public,anon,authenticated;
grant execute on function public.team_planning_settings(date,date) to service_role;

create or replace function public.apply_team_shift_plan(changes jsonb,template_version text,target_version text)
returns integer language plpgsql security invoker set search_path=pg_catalog as $fn$
declare item jsonb; existing public.team_staff_shifts; person public.team_staff; template public.team_shift_templates; adjacent timestamptz; total integer := 0;
  old_start integer; old_end integer; code text;
begin
  if jsonb_typeof(changes) <> 'array' or jsonb_array_length(changes) not between 1 and 20 then raise exception 'Phương án không hợp lệ'; end if;
  if (select count(distinct value->>'staff_id') from jsonb_array_elements(changes)) <> jsonb_array_length(changes) then raise exception 'Nhân sự bị trùng trong phương án'; end if;
  -- Protect configuration during application and detect changes since preview.
  lock table public.team_shift_templates,public.team_staffing_targets in share mode;
  if (select md5(coalesce(string_agg(id::text||updated_at::text,',' order by id),'')) from public.team_shift_templates) is distinct from template_version
     or (select md5(coalesce(string_agg(id::text||updated_at::text,',' order by id),'')) from public.team_staffing_targets) is distinct from target_version then
    raise exception 'Cấu hình ca/định biên đã thay đổi. Hãy tạo gợi ý mới.' using errcode='40001';
  end if;
  for item in select value from jsonb_array_elements(changes) order by value->>'staff_id' loop
    if (item->>'work_date')::date < (now() at time zone 'Asia/Ho_Chi_Minh')::date then raise exception 'Không tự phân ca vào ngày quá khứ'; end if;
    select * into person from public.team_staff where id=item->>'staff_id' for update;
    if not found or person.archived or lower(person.status)<>'active' or person.role not in ('FTE','BPO')
      or person.updated_at is distinct from (item->>'staff_updated_at')::timestamptz then
      raise exception 'Hồ sơ nhân sự đã thay đổi. Hãy tạo gợi ý mới.' using errcode='40001'; end if;
    select * into existing from public.team_staff_shifts where staff_id=person.id and work_date=(item->>'work_date')::date for update;
    if not found or existing.shift is distinct from item->>'from_shift' or existing.updated_at is distinct from (item->>'expected_updated_at')::timestamptz then
      raise exception 'Lịch đã có người chỉnh sửa. Hãy tạo gợi ý mới.' using errcode='40001'; end if;
    if existing.shift !~ '^[0-9]{2}:[0-9]{2}-[0-9]{2}:[0-9]{2}$' then raise exception 'Không được đổi OFF/phép hoặc ca chưa rõ'; end if;
    select updated_at into adjacent from public.team_staff_shifts where staff_id=person.id and work_date=existing.work_date-1 for update;
    if adjacent is distinct from (item->>'expected_previous_at')::timestamptz then raise exception 'Lịch ngày trước đã thay đổi' using errcode='40001'; end if;
    select updated_at into adjacent from public.team_staff_shifts where staff_id=person.id and work_date=existing.work_date+1 for update;
    if adjacent is distinct from (item->>'expected_next_at')::timestamptz then raise exception 'Lịch ngày sau đã thay đổi' using errcode='40001'; end if;
    select * into template from public.team_shift_templates where id=(item->>'template_id')::uuid and active;
    if not found then raise exception 'Ca không còn hoạt động'; end if;
    old_start := substring(existing.shift,1,2)::integer*60+substring(existing.shift,4,2)::integer;
    old_end := substring(existing.shift,7,2)::integer*60+substring(existing.shift,10,2)::integer;
    if mod(old_end-old_start+1440,1440) <> mod(template.end_minute-template.start_minute+1440,1440) then raise exception 'Phải giữ thời lượng ca'; end if;
    code := lpad((template.start_minute/60)::text,2,'0')||':'||lpad(mod(template.start_minute,60)::text,2,'0')||'-'||lpad((template.end_minute/60)::text,2,'0')||':'||lpad(mod(template.end_minute,60)::text,2,'0');
    if item->>'to_shift' is distinct from code then raise exception 'Giờ làm không khớp danh mục ca'; end if;
    update public.team_staff_shifts set shift=item->>'to_shift',template_id=template.id,source_file='Phân ca từ gợi ý' where id=existing.id;
    total := total+1;
  end loop;
  return total;
end $fn$;
revoke all on function public.apply_team_shift_plan(jsonb,text,text) from public,anon,authenticated;
grant execute on function public.apply_team_shift_plan(jsonb,text,text) to service_role;

create or replace function public.team_daily_workload(first_day date,last_day date)
returns table(work_date date,area text,delivery bigint,pickup bigint)
language sql stable security invoker set search_path=pg_catalog as $fn$
  select x.report_date,x.area,sum(x.delivery)::bigint,sum(x.pickup)::bigint from (
    select d.report_date,d.area,sum(d.total_orders)::bigint as delivery,0::bigint as pickup from public.delivery_order d
      where d.report_date between first_day and last_day group by d.report_date,d.area
    union all
    select p.report_date,p.area,0::bigint,sum(p.total_orders)::bigint from public.pickup_volume p
      where p.report_date between first_day and last_day group by p.report_date,p.area
  ) x group by x.report_date,x.area;
$fn$;
revoke all on function public.team_daily_workload(date,date) from public,anon,authenticated;
grant execute on function public.team_daily_workload(date,date) to service_role;
