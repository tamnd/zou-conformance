-- The table the deployed functions are written against.
--
-- `select-from-table-with-auth-rls` in the examples project selects
-- everything from `users` through a client built out of the caller's
-- own token, and says in its own comment that row level security is
-- the point. Upstream's examples project ships no migration for it, so
-- this is the user management quickstart's own table and policy, which
-- is what the function's readme points at.
--
-- Two things are here so the file can be applied twice and so there is
-- no CLI in the loop: the drops at the top, and the grants at the
-- bottom. Supabase grants the api roles on the public schema by
-- default and zou does the same, but a file that says what it needs
-- can be applied to either.
--
-- auth.users has to exist before this runs, which it does once the
-- server has taken a connection.

drop trigger if exists on_auth_user_created on auth.users;
drop function if exists public.handle_new_user();
drop table if exists public.users;

create table users (
  id uuid references auth.users on delete cascade primary key,
  email text,
  inserted_at timestamp with time zone default timezone('utc'::text, now()) not null
);

alter table users enable row level security;

-- One policy, and it is the whole demonstration: two accounts, one
-- table, and each of them selects everything and gets one row.
create policy "Individuals can view their own user row." on users for
    select using (auth.uid() = id);

-- A row per account, written by the database when the account is
-- created, because the function reads this table rather than writing
-- it. Security definer so the insert is not the new user's to make.
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.users (id, email) values (new.id, new.email);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

grant select on public.users to anon, authenticated, service_role;

notify pgrst, 'reload schema';
