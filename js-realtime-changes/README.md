# the postgres changes suite

A table in the publication, a client subscribed to it, and the frames that carried the rows.

The two realtime directories next to this one are about messages a client sent.
This one is about rows nobody sent: somebody adds a table to the `supabase_realtime` publication, somebody else writes to it over `/rest/v1`, and whoever subscribed is told.
Nothing in the file opens a connection to the database, on purpose, because a suite that held one could set a row up in a way no application could and then assert about what came back.

The questions are ours.
supabase-js ships an integration suite and it subscribes to no tables, so there is nothing to copy, and these are written the way the Supabase documentation writes a subscription: a channel, an `on('postgres_changes', ...)` naming a schema and a table, and a callback reading `eventType`, `new` and `old`.

`setup.sql` is the fixture, and it is five tables and one realtime line.
Four of them are in the publication and one is not, which is the only way to ask whether a table nobody opted in is really left alone.
One of the four publishes its old rows, which is the single setting that changes what an update and a delete carry, one has row level security on it with a policy about who owns a row, and one is written to by nothing but the frame test below.

Every grant in it is spelled out, including the writes to `service_role`, and that is not decoration.
A new table in `public` on a Supabase project is granted to nobody who arrives through the api: the default privileges there hand the three roles truncate, references, trigger and maintain and none of select, insert, update or delete.
`bypassrls` on the service role does not help, because it is about policies and a grant is a grant.

## What a join has to wait for

`SUBSCRIBED` is the join reply and it is not the whole answer.

The changes are read off the write ahead log by something that is set up alongside the channel, and until that is running a write goes past with nobody watching, which is a lost change and no error anywhere.
Both servers say when it is running, in the same frame: a `system` event on the channel reading `Subscribed to PostgreSQL`.
So every test here waits for that frame before it writes, which is what an application that writes as soon as it has subscribed has to do.

It is not a formality on the reference.
The first subscriber to a project after Supabase Realtime starts waits about three and a half seconds for it, and every one after that waits for nothing, which is a race a suite run against a stack that has been up for an hour never sees and a suite run in CI sees every time.

It is also where a subscription that could not be made is said, with `status: error` and a message naming every parameter of the binding, which is what a table nobody added to the publication gets.
That is asserted whole, wording and all, because it is what somebody reads in their console when a subscription that looks right is silent.

## The frames

The last test is a different kind of question.

Everything above it reads what the client handed the application, and that is the fold of the frames rather than the frames.
A server can get the fold right and still send something upstream never sends, and the client would not notice: it takes the ids out of the join's answer, routes changes on them, renames `record` to `new` and hands the application an object.

So that test records the frames off the socket, before the client has decoded them, and compares them with the frames Supabase Realtime sent for the same three writes.
Three things in a frame are true of a run rather than of a server, and they are replaced rather than dropped: a ref becomes `<ref>`, a subscription id becomes the position it held in the join's answer, and the commit timestamp becomes `<timestamp>`.
Replacing the ids by position keeps the thing about them that matters, which is that a change came back naming the subscription the join made, and that is what a client routes on.

The table it writes to is its own, because a golden is every frame the channel was sent.
Supabase Realtime reads the write ahead log on a timer and gives the batch to whoever is subscribed when it lands, so a row committed a moment before a join can still reach it, and a table the rest of the file writes to would put somebody else's change in the recording.

`frames.json` is that recording, taken from a real `supabase start` with `ZOU_RECORD=1`.
A run in that mode writes the file and asserts nothing about frames, which is why it is only ever run against the reference.

## What it caught on the day it was written

Three things, one from each direction this file can be run.

**zou answered a join before it had a replication slot.**
A slot sees what was written after it existed and nothing before, and zou takes one when the first subscriber arrives rather than holding one open for a project nobody is subscribed to.
So a client that subscribed and then wrote, which is what these tests do and what half the tutorials do, was told `SUBSCRIBED` while the slot was still being created, and the row it wrote next was written before there was anything to see it.
Eight of the eleven tests here failed on their first run and passed with a second and a half of sleep in front of every write, which is how it was found.
The fix is in the server rather than in this file: the join reply now waits for the tap.
Upstream has nothing to wait for, because its slot is permanent and always being read.

**The recording had a frame in it that zou did not send.**
After the join reply, Supabase Realtime sends a `system` event reading `Subscribed to PostgreSQL`.
supabase-js does nothing with it, which is exactly why none of the ten tests above could have noticed, and an application that binds `system` is handed it.

**And the two servers disagreed about an ordinary update.**
On a table with the default replica identity, an update that leaves the key alone writes no old row into the log at all, and zou sent `old_record: {}` for it.
Supabase Realtime sends the key, taken from the new row, which is the difference between a client being told which row this was and being told nothing.

The fixture was wrong too, and only the reference could say so.
It granted the reads and left the writes ungranted, on the reasoning that a service key needs no grant, and every write in it failed against `supabase start` with a 403 while passing against zou.
That is a difference in the servers rather than in the file, and it is written down as an issue there rather than papered over here.

## Running it

The rows need a database, so this suite needs a server with one behind it.

```
cd /path/to/zou
cargo run -p zou-conformance -- serve \
  --zou-dsn "postgres://postgres@127.0.0.1:5432/postgres" \
  --jwt-secret super-secret-jwt-token-with-at-least-32-characters-long \
  --setup /path/to/zou-conformance/js-realtime-changes/setup.sql &

cd /path/to/zou-conformance/js-realtime-changes
npm ci
npm test
```

The database has to be able to decode logically, which is `wal_level = logical` and a restart.
A server zou started is already there and one you brought yourself may not be.

Against a real local stack instead, which is the reason to trust the questions:

```
supabase start
psql "$DB_URL" -v ON_ERROR_STOP=1 -f setup.sql
ZOU_URL=http://127.0.0.1:54321 ZOU_ANON_KEY=<the anon key> npm test
```

CI runs it both ways, the same as the suites next to it.
A failure against the stack a person gets is this repository having written down something Supabase Realtime does not do, and should be read as the suite being wrong rather than the server.
