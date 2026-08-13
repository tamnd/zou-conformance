-- The tables a project puts in the publication, and the grants and
-- policies that decide who is told about them.
--
-- Nothing here is realtime configuration either, except one line. A
-- table is watched because somebody added it to the `supabase_realtime`
-- publication, which is what the Supabase dashboard's toggle does and
-- what the line below does by hand. Everything else in this file is
-- ordinary sql about ordinary tables: a primary key, a grant, and a
-- policy, because who is sent a changed row is decided by whether the
-- database would have shown them that row.
--
-- Applied to both targets unedited, and written to be applied twice.

create table if not exists public.conformance_watched (
    id bigint primary key,
    body text,
    tally int
);

-- The same table again with its old rows published, which is the one
-- setting that changes what an update and a delete carry.
create table if not exists public.conformance_watched_full (
    id bigint primary key,
    body text,
    tally int
);
alter table public.conformance_watched_full replica identity full;

-- A table with row level security on it, so that a subscriber is sent
-- the rows they could have selected and no others.
create table if not exists public.conformance_watched_mine (
    id bigint primary key,
    owner uuid not null,
    body text
);
alter table public.conformance_watched_mine enable row level security;
drop policy if exists "conformance owner reads" on public.conformance_watched_mine;
create policy "conformance owner reads" on public.conformance_watched_mine
for select to authenticated
using (owner = auth.uid());

-- The table the recorded frames are of, and it is a table of its own
-- for a reason worth writing down. Supabase Realtime reads the write
-- ahead log on a timer and hands a batch to whoever is subscribed when
-- it lands, so a change committed a moment before somebody joined can
-- still reach them. A golden is every frame a channel was sent, so a
-- table nobody else in the file writes to is the only way the recording
-- is the three writes it says it is.
create table if not exists public.conformance_golden (
    id bigint primary key,
    body text,
    tally int
);

-- And one that is not in the publication at all, which is the question
-- the others cannot ask: a table nobody added is not read, decoded or
-- sent.
create table if not exists public.conformance_unwatched (
    id bigint primary key,
    body text
);

-- The suite reads as the person and writes as the key, so the reads go
-- to the two roles a person arrives as and the writes go only to the
-- key's role: a subscriber that could write would be a fixture able to
-- lie to itself.
--
-- Every one of these is spelled out because a new table in public is
-- granted to nobody. A Supabase project's default privileges there hand
-- the three api roles truncate, references, trigger and maintain and
-- none of select, insert, update or delete, so a table nobody granted
-- is a table nobody can read, which is also why `bypassrls` on the
-- service role is not enough on its own: it is about policies and not
-- about grants.
grant usage on schema public to anon, authenticated, service_role;
grant select on public.conformance_watched to anon, authenticated;
grant select on public.conformance_watched_full to anon, authenticated;
grant select on public.conformance_watched_mine to anon, authenticated;
grant select on public.conformance_golden to anon, authenticated;
grant select on public.conformance_unwatched to anon, authenticated;
grant select, insert, update, delete on public.conformance_watched to service_role;
grant select, insert, update, delete on public.conformance_watched_full to service_role;
grant select, insert, update, delete on public.conformance_watched_mine to service_role;
grant select, insert, update, delete on public.conformance_golden to service_role;
grant select, insert, update, delete on public.conformance_unwatched to service_role;

-- Rows a previous run left behind. A change is a change to whatever is
-- in the table now, so a run that starts with somebody else's rows in
-- it asks about rows it did not write.
truncate public.conformance_watched;
truncate public.conformance_watched_full;
truncate public.conformance_watched_mine;
truncate public.conformance_golden;
truncate public.conformance_unwatched;

-- The one realtime line in the file. `if not exists` on a publication
-- member is postgres 18 and the reference is on 17, so the membership
-- is looked up instead.
do $$
begin
    if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
        create publication supabase_realtime;
    end if;
end
$$;

do $$
declare
    watched text;
begin
    foreach watched in array array[
        'conformance_watched',
        'conformance_watched_full',
        'conformance_watched_mine',
        'conformance_golden'
    ]
    loop
        if not exists (
            select 1 from pg_publication_tables
            where pubname = 'supabase_realtime'
              and schemaname = 'public'
              and tablename = watched
        ) then
            execute format('alter publication supabase_realtime add table public.%I', watched);
        end if;
    end loop;
end
$$;

-- The tables above are new to whichever PostgREST is in front of this
-- database, and it answers out of a schema cache it built before this
-- script ran. Supabase's stack reloads on this.
notify pgrst, 'reload schema';
