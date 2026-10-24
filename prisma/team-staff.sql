-- Personnel directory is separate from auth profiles and rider permissions.
create table if not exists public.team_staff (
  id text primary key check (length(id) between 1 and 64),
  full_name text not null check (length(full_name) between 1 and 150),
  ops_id text not null default '', staff_id text not null default '', email text not null default '',
  role text not null check (role in ('SUP','LEAD','FTE','BPO','UNKNOWN')),
  source_title text not null default '', team text not null default '', status text not null default '',
  gender text not null default '', onboard text not null default '', vendor text not null default '',
  coverage text not null default '', areas text[] not null default '{}'
    check (areas <@ array['KV1','KV2','KV3','KV4','KV5','KV6','SPF']::text[]),
  archived boolean not null default false, review_note text not null default '',
  source_file text not null default '', source_row integer,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.team_staff_shifts (
  id uuid primary key default gen_random_uuid(),
  staff_id text not null references public.team_staff(id) on delete restrict,
  work_date date not null, shift text not null check (length(shift) between 1 and 100),
  source_file text not null default '',
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(staff_id,work_date)
);
create index if not exists team_staff_shifts_date_idx on public.team_staff_shifts(work_date);
create unique index if not exists team_staff_ops_id_key on public.team_staff(lower(ops_id)) where ops_id <> '';
alter table public.team_staff enable row level security;
alter table public.team_staff_shifts enable row level security;
revoke all on public.team_staff, public.team_staff_shifts from public, anon, authenticated;
grant select,insert,update,delete on public.team_staff,public.team_staff_shifts to service_role;

create or replace function ops_private.guard_team_staff()
returns trigger language plpgsql security definer set search_path=pg_catalog as $fn$
declare actor uuid := ops_private.request_actor(); actor_role text;
begin
  if actor is not null then
    select p.role into actor_role from public.profiles p where p.id=actor;
    if actor_role is distinct from 'admin' then
      raise exception 'Chỉ admin được chỉnh sửa nhân sự và lịch FTE' using errcode='42501';
    end if;
  elsif coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb->>'role' = 'authenticated' then
    raise exception 'Thiếu người chỉnh sửa' using errcode='42501';
  end if;
  if TG_OP='DELETE' then return old; end if;
  new.updated_at := now();
  return new;
end $fn$;
revoke all on function ops_private.guard_team_staff() from public,anon,authenticated;
drop trigger if exists guard_team_staff on public.team_staff;
create trigger guard_team_staff before insert or update or delete on public.team_staff
  for each row execute function ops_private.guard_team_staff();
drop trigger if exists guard_team_staff_shifts on public.team_staff_shifts;
create trigger guard_team_staff_shifts before insert or update or delete on public.team_staff_shifts
  for each row execute function ops_private.guard_team_staff();
drop trigger if exists audit_user_changes on public.team_staff;
create trigger audit_user_changes after insert or update or delete on public.team_staff
  for each row execute function ops_private.audit_user_change();
drop trigger if exists audit_user_changes on public.team_staff_shifts;
create trigger audit_user_changes after insert or update or delete on public.team_staff_shifts
  for each row execute function ops_private.audit_user_change();

-- One transaction: a malformed row rolls back the complete import.
create or replace function public.import_team_roster(payload jsonb, filename text)
returns jsonb language plpgsql security invoker set search_path=pg_catalog as $fn$
begin
  if jsonb_typeof(payload->'staff') is distinct from 'array'
     or jsonb_typeof(payload->'shifts') is distinct from 'array'
     or jsonb_array_length(payload->'staff') not between 1 and 2000
     or jsonb_array_length(payload->'shifts') > 100000 then
    raise exception 'Dữ liệu nhân sự không hợp lệ';
  end if;
  insert into public.team_staff(id,full_name,ops_id,staff_id,email,role,source_title,team,status,gender,onboard,vendor,coverage,areas,archived,review_note,source_file,source_row)
  select x.id,x.full_name,x.ops_id,x.staff_id,x.email,x.role,x.source_title,x.team,x.status,x.gender,x.onboard,x.vendor,x.coverage,x.areas,x.archived,x.review_note,left(filename,250),x.source_row
  from jsonb_to_recordset(payload->'staff') as x(id text,full_name text,ops_id text,staff_id text,email text,role text,source_title text,team text,status text,gender text,onboard text,vendor text,coverage text,areas text[],archived boolean,review_note text,source_row integer)
  on conflict(id) do update set full_name=excluded.full_name,ops_id=excluded.ops_id,staff_id=excluded.staff_id,email=excluded.email,
    role=excluded.role,source_title=excluded.source_title,team=excluded.team,status=excluded.status,gender=excluded.gender,onboard=excluded.onboard,
    vendor=excluded.vendor,coverage=excluded.coverage,areas=excluded.areas,archived=excluded.archived,review_note=excluded.review_note,
    source_file=excluded.source_file,source_row=excluded.source_row
  where (to_jsonb(team_staff)-'updated_at'-'created_at') is distinct from (to_jsonb(excluded)-'updated_at'-'created_at');
  insert into public.team_staff_shifts(staff_id,work_date,shift,source_file)
  select x.staff_id,x.work_date,x.shift,left(filename,250)
  from jsonb_to_recordset(payload->'shifts') as x(staff_id text,work_date date,shift text)
  on conflict(staff_id,work_date) do update set shift=excluded.shift,source_file=excluded.source_file
  where team_staff_shifts.shift is distinct from excluded.shift;
  return jsonb_build_object('staff',jsonb_array_length(payload->'staff'),'shifts',jsonb_array_length(payload->'shifts'));
end $fn$;
revoke all on function public.import_team_roster(jsonb,text) from public,anon,authenticated;
grant execute on function public.import_team_roster(jsonb,text) to service_role;
