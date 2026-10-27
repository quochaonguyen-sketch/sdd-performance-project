create table if not exists public.feedback_notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  feedback_id uuid not null references public.user_feedback(id) on delete cascade,
  title text not null,
  response text not null default '',
  status text not null,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
-- statement-breakpoint
create index if not exists feedback_notifications_user_created_idx on public.feedback_notifications(user_id, created_at desc);
-- statement-breakpoint
alter table public.feedback_notifications enable row level security;
-- statement-breakpoint
revoke all on public.feedback_notifications from public, anon, authenticated;
-- statement-breakpoint
grant all on public.feedback_notifications to service_role;
-- statement-breakpoint
create or replace function public.notify_feedback_owner() returns trigger
language plpgsql security invoker set search_path = public, pg_temp as $$
begin
  insert into public.feedback_notifications(user_id, feedback_id, title, response, status)
  values(new.user_id, new.id, new.title, new.response, new.status);
  return new;
end;
$$;
-- statement-breakpoint
revoke all on function public.notify_feedback_owner() from public, anon, authenticated;
-- statement-breakpoint
grant execute on function public.notify_feedback_owner() to service_role;
-- statement-breakpoint
drop trigger if exists notify_feedback_owner on public.user_feedback;
-- statement-breakpoint
create trigger notify_feedback_owner after update on public.user_feedback for each row
when (old.status is distinct from new.status or old.response is distinct from new.response)
execute function public.notify_feedback_owner();
-- statement-breakpoint
create table if not exists public.web_vital_samples (
  metric_id text not null,
  name text not null check (name in ('LCP','INP','CLS','FCP','TTFB')),
  value double precision not null check (value >= 0 and value <= 300000),
  rating text not null check (rating in ('good','needs-improvement','poor')),
  path text not null,
  device text not null check (device in ('mobile','desktop')),
  created_at timestamptz not null default now(),
  primary key (metric_id, name)
);
-- statement-breakpoint
create index if not exists web_vital_samples_created_idx on public.web_vital_samples(created_at);
-- statement-breakpoint
alter table public.web_vital_samples enable row level security;
-- statement-breakpoint
revoke all on public.web_vital_samples from public, anon, authenticated;
-- statement-breakpoint
grant all on public.web_vital_samples to service_role;
-- statement-breakpoint
create or replace function public.web_vital_summary()
returns table(path text, device text, name text, p75 double precision, samples bigint)
language sql stable security invoker set search_path = public, pg_temp as $$
  select s.path, s.device, s.name, percentile_cont(0.75) within group(order by s.value), count(*)
  from public.web_vital_samples s where s.created_at >= now() - interval '7 days'
  group by s.path, s.device, s.name order by s.path, s.device, s.name
$$;
-- statement-breakpoint
revoke all on function public.web_vital_summary() from public, anon, authenticated;
-- statement-breakpoint
grant execute on function public.web_vital_summary() to service_role;
