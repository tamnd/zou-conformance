-- The policies a project writes for private channels, and the table
-- they read.
--
-- Nothing here is realtime configuration. A private channel is allowed
-- or refused by ordinary row level security policies on
-- realtime.messages, so a project decides who may be in a room by
-- writing sql about its own tables, which is what this is: a membership
-- table, a row per person per room, and a flag for whether that
-- membership may send.
--
-- Applied to both targets unedited. The room names are fixed rather
-- than made up per test, because a policy that reads a table has to
-- have something in the table to read, and there is no connection to
-- the database from inside the suite.

create table if not exists public.conformance_members (
    room text not null,
    person uuid not null,
    may_write boolean not null default false,
    primary key (room, person)
);

-- The policies run as the authenticated role, so that role has to be
-- able to read the table they read. No row level security on it: it is
-- a fixture, and the thing under test is the policy on
-- realtime.messages rather than this.
grant usage on schema public to authenticated;
grant select on public.conformance_members to authenticated;

-- The person the suite signs in as, in a room they may send to and a
-- room they may only listen in.
insert into public.conformance_members (room, person, may_write)
values
    ('lobby', '6f8a1d20-2f0a-4a2e-9a1d-0a8f1c2b3d4e', true),
    ('listen', '6f8a1d20-2f0a-4a2e-9a1d-0a8f1c2b3d4e', false)
on conflict (room, person) do update set may_write = excluded.may_write;

drop policy if exists "conformance read" on realtime.messages;
drop policy if exists "conformance write" on realtime.messages;

-- Reading a room is being in it. Writing to one is being in it with the
-- flag on. auth.uid() is whoever the token on the channel says it is,
-- and realtime.topic() is the room's name.
create policy "conformance read" on realtime.messages
for select to authenticated
using (
    exists (
        select 1 from public.conformance_members m
        where m.room = realtime.topic() and m.person = auth.uid()
    )
    or realtime.topic() = (auth.uid())::text
);

create policy "conformance write" on realtime.messages
for insert to authenticated
with check (
    exists (
        select 1 from public.conformance_members m
        where m.room = realtime.topic() and m.person = auth.uid() and m.may_write
    )
    or realtime.topic() = (auth.uid())::text
);

-- Sending from sql, which is the other half of how a room is written
-- to: a trigger or a job calls realtime.send() and whoever is on the
-- channel hears it, with no client anywhere in the transaction.
--
-- There is no connection to the database from inside the suite, so the
-- way to ask that question through the client is a function the client
-- can call. This one is a plain security invoker function, so the send
-- runs as the person the token says it is and the same policies above
-- decide whether it lands, which is what makes it the same question the
-- rest of this file is asking.
create or replace function public.conformance_send(
    room text,
    name text,
    body jsonb,
    is_private boolean default true
) returns void
language sql
as $$
    select realtime.send(body, name, room, is_private);
$$;

grant execute on function public.conformance_send(text, text, jsonb, boolean) to authenticated;

-- Best effort, because the function may belong to a role this script is
-- not. Functions are executable by everybody unless somebody revoked
-- it, so the usual outcome is that this changes nothing.
do $$
begin
    execute 'grant execute on function realtime.send(jsonb, text, text, boolean) to authenticated';
exception when others then
    null;
end
$$;
