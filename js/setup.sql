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

-- The bucket the Storage block uploads into, and the policy that lets
-- it, both from upstream's third migration:
--
--   packages/core/supabase-js/supabase/migrations/20250424000000_storage_anon_policy.sql
--
-- Copied whole, comments and all. The policy is deliberately wide open
-- on one bucket and it is what makes the block a test of the client
-- rather than of a key: the anon key uploads, lists and deletes with
-- no service role anywhere in it.

-- Create test bucket for storage tests
insert into storage.buckets (id, name, public)
values ('test-bucket', 'test-bucket', false)
on conflict (id) do nothing;

-- Allow CRUD access to test-bucket so integration tests can exercise the
-- storage SDK with the publishable key (no service-role bypass needed).
-- RLS is enabled on storage.objects by default; FOR ALL with no role clause
-- defaults to PUBLIC and matches whichever role the storage server uses.

drop policy if exists "test-bucket public access" on storage.objects;
create policy "test-bucket public access"
on storage.objects
for all
using (bucket_id = 'test-bucket');

-- The policies the Realtime block is written against, from upstream's
-- second migration:
--
--   packages/core/supabase-js/supabase/migrations/20250423000000_realtime_rls_setup.sql
--
-- Copied whole, with a drop in front of each so the file can be applied
-- twice. Every channel that block opens is private and named
-- channel-<uuid>, so the topic test is upstream deciding that a room
-- with channel in its name is a room anybody signed in may be in, which
-- is a fixture rather than a rule about private channels.

drop policy if exists "authenticated can read all messages on topic" on realtime.messages;
drop policy if exists "authenticated can insert messages on topic" on realtime.messages;

create policy "authenticated can read all messages on topic"
on "realtime"."messages"
for select
to authenticated
using ( realtime.topic() like '%channel%' );

create policy "authenticated can insert messages on topic"
on "realtime"."messages"
for insert
to authenticated
with check (realtime.topic() like '%channel%');
