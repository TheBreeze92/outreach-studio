-- Per-user credit ledger
create table if not exists user_credits (
  user_id      uuid        primary key references auth.users(id) on delete cascade,
  free_used    int         not null default 0,
  paid_credits int         not null default 0,
  updated_at   timestamptz not null default now()
);

alter table user_credits enable row level security;

-- Users may read only their own row; all writes go through the service role.
drop policy if exists "read own credits" on user_credits;
create policy "read own credits" on user_credits
  for select using (auth.uid() = user_id);

-- Webhook idempotency log (service-role only; RLS on with no policies = no client access)
create table if not exists stripe_events (
  event_id   text        primary key,
  created_at timestamptz not null default now()
);
alter table stripe_events enable row level security;

-- Returns the caller's credit row, creating an empty one if needed.
create or replace function get_or_create_credits(uid uuid)
returns user_credits
language plpgsql
security definer
as $$
declare
  result user_credits;
begin
  insert into user_credits (user_id) values (uid)
    on conflict (user_id) do nothing;
  select * into result from user_credits where user_id = uid;
  return result;
end;
$$;

-- Atomically consume one credit: free pool first, then paid. Returns true if consumed.
create or replace function consume_credit(uid uuid)
returns boolean
language plpgsql
security definer
as $$
begin
  insert into user_credits (user_id) values (uid)
    on conflict (user_id) do nothing;

  update user_credits
    set free_used = free_used + 1, updated_at = now()
    where user_id = uid and free_used < 3;
  if found then
    return true;
  end if;

  update user_credits
    set paid_credits = paid_credits - 1, updated_at = now()
    where user_id = uid and paid_credits > 0;
  if found then
    return true;
  end if;

  return false;
end;
$$;

-- Add purchased credits (idempotency handled by the webhook caller).
create or replace function add_credits(uid uuid, amount int)
returns void
language plpgsql
security definer
as $$
begin
  insert into user_credits (user_id, paid_credits) values (uid, amount)
    on conflict (user_id) do update
      set paid_credits = user_credits.paid_credits + amount, updated_at = now();
end;
$$;
