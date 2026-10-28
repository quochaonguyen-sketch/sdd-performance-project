create table if not exists public.role_page_permissions (
 role text primary key check(role in ('member','leader')),
 pages jsonb not null default '{}'::jsonb check(jsonb_typeof(pages)='object'),
 updated_at timestamptz not null default now(),
 updated_by uuid
);
alter table public.role_page_permissions enable row level security;
revoke all on public.role_page_permissions from public,anon,authenticated;
grant select,insert,update on public.role_page_permissions to service_role;
insert into public.role_page_permissions(role) values('member'),('leader') on conflict do nothing;
notify pgrst,'reload schema';
