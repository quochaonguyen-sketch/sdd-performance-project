create table if not exists public.user_feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  author_name text not null,
  kind text not null check (kind in ('BUG', 'SUGGESTION')),
  title text not null check (char_length(title) between 3 and 160),
  content text not null check (char_length(content) between 10 and 5000),
  page_path text not null default '' check (char_length(page_path) <= 300),
  status text not null default 'OPEN' check (status in ('OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED')),
  response text not null default '' check (char_length(response) <= 5000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists user_feedback_user_created_idx on public.user_feedback(user_id, created_at desc);
create index if not exists user_feedback_created_idx on public.user_feedback(created_at desc);
create table if not exists public.product_updates (
  id uuid primary key default gen_random_uuid(),
  author_id uuid references auth.users(id) on delete set null,
  title text not null check (char_length(title) between 3 and 160),
  content text not null check (char_length(content) between 10 and 5000),
  created_at timestamptz not null default now()
);
create index if not exists product_updates_created_idx on public.product_updates(created_at desc);
create table if not exists public.product_update_reads (
  user_id uuid not null references auth.users(id) on delete cascade,
  update_id uuid not null references public.product_updates(id) on delete cascade,
  primary key (user_id, update_id)
);
alter table public.user_feedback enable row level security;
alter table public.product_updates enable row level security;
alter table public.product_update_reads enable row level security;
-- Access goes through authenticated server endpoints with current profile checks.
revoke all on public.user_feedback, public.product_updates, public.product_update_reads from anon, authenticated;
grant all on public.user_feedback, public.product_updates, public.product_update_reads to service_role;
