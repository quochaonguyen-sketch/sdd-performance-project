alter table public.wh_seatalk_reports
  add column if not exists thread_pending boolean not null default false,
  add column if not exists scheduled_runs jsonb not null default '{}'::jsonb;
