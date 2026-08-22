-- What the app's own migrations do not say, and on a Supabase project
-- today have to be said.
--
-- The app is upstream's slack clone, unedited, and its migrations
-- create five tables in `public`, turn row level security on and write
-- the policies. What they never write is a `grant`, because the project
-- they were written against handed every new table in `public` to
-- `anon` and `authenticated` on its own, and row level security was the
-- only guard that mattered.
--
-- That is not the stance of the stack a person gets today. A new table
-- in `public` arrives with truncate, references, trigger and maintain
-- for the api roles and with none of select, insert, update or delete,
-- so the policies above are policies on a table nobody may reach. zou
-- matches that, see tamnd/zou#344, and so this file is what the app
-- would carry as its next migration if it were being written now.
--
-- It is here rather than in `app/`, which stays upstream's, and the
-- harness applies it after the migrations and before the seed.
--
-- The grants are the reads and writes the policies already talk about.
-- Everything they allow is still decided by those policies: `anon`
-- holds select on `messages` after this and reads none of them, which
-- is one of the five tests.

grant select, insert, update on table public.users to anon, authenticated;
grant select, insert, delete on table public.channels to anon, authenticated;
grant select, insert, update, delete on table public.messages to anon, authenticated;
grant select on table public.user_roles to anon, authenticated;

-- A channel and a message have an identity column, which is answered
-- with a nextval of the sequence behind it, so the grant on the table
-- is not the whole grant.
grant usage, select on all sequences in schema public to anon, authenticated;
