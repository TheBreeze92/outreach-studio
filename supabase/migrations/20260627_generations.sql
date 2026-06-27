-- Generation log: every email the tool produces, for the data flywheel.
-- Inputs stored are sender metadata only — never the uploaded PDF.
create table if not exists generations (
  id              uuid        primary key default gen_random_uuid(),
  user_id         uuid        not null references auth.users(id) on delete cascade,
  created_at      timestamptz not null default now(),
  inputs          jsonb       not null default '{}'::jsonb,
  signal_tier     text,       -- 'hot' | 'soft' | 'general'
  signal_headline text,
  output          jsonb,
  replied         boolean     -- null = not yet reported; set via self-report
);

create index if not exists generations_user_created_idx
  on generations (user_id, created_at desc);

alter table generations enable row level security;

-- Users may read only their own generations; all writes go through the service role.
drop policy if exists "read own generations" on generations;
create policy "read own generations" on generations
  for select using (auth.uid() = user_id);
