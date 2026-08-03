-- The fixture the supabase-js integration suite is written against.
--
-- Upstream keeps it in two files, a migration and a seed, which the
-- supabase CLI applies for it:
--
--   packages/core/supabase-js/supabase/migrations/20250422000000_create_todos_table.sql
--   packages/core/supabase-js/supabase/seed/seed_todos.sql
--
-- They are one file here because there is no CLI in the loop, and they
-- are applied over a connection rather than by a migration runner. Two
-- differences from upstream, both so the file can be applied twice to
-- the same database: the drop at the top, and the policies created
-- after it rather than with the table.
--
-- auth.users has to exist before this runs. zou creates it on its first
-- connection to a database, which is why the harness warms the server
-- before it says it is ready.

drop table if exists public.todos;

create table public.todos (
    id uuid primary key default gen_random_uuid(),
    task text not null,
    is_complete boolean not null default false,
    created_at timestamptz not null default now(),
    user_id uuid references auth.users(id)
);

alter table public.todos enable row level security;

-- Anonymous reads everything, and writes, which is upstream's own
-- comment: it is there for the older tests rather than because a public
-- todo list is a good idea.
create policy "Allow anonymous read access" on public.todos
    for select to anon using (true);

create policy "Allow anonymous insert access" on public.todos
    for insert to anon with check (true);

create policy "Allow anonymous delete access" on public.todos
    for delete to anon using (true);

create policy "Allow authenticated read own todos" on public.todos
    for select to authenticated using (auth.uid() = user_id);

create policy "Allow authenticated insert own todos" on public.todos
    for insert to authenticated with check (auth.uid() = user_id);

create policy "Allow authenticated update own todos" on public.todos
    for update to authenticated using (auth.uid() = user_id)
    with check (auth.uid() = user_id);

create policy "Allow authenticated delete own todos" on public.todos
    for delete to authenticated using (auth.uid() = user_id);

grant select, insert, update, delete on public.todos to anon, authenticated, service_role;

insert into public.todos (task, is_complete)
values
    ('Buy groceries', false),
    ('Complete project report', true),
    ('Call mom', false),
    ('Schedule dentist appointment', false),
    ('Pay bills', true);

notify pgrst, 'reload schema';
