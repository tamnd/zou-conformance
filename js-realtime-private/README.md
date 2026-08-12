# the private channel suite

A private channel, asked through the client that subscribes to one, against policies a project wrote itself.

This is the only part of realtime whose answer is not in the server. A channel with `private: true` on it is allowed or refused by ordinary row level security policies on `realtime.messages`, and those policies are sql a project writes about its own tables, reading `realtime.topic()` for the room and `auth.uid()` for the person. `setup.sql` here is what such a project looks like: a membership table, a row per person per room, a flag for whether that membership may send, and two policies that read it. Both targets get it unedited, so a disagreement between them is a disagreement about the server rather than about the fixture.

The person is minted here rather than signed up through GoTrue, because a policy reads claims and nothing else. The client is handed it through `realtime.setAuth`, which is what puts a token in the join payload, and the http questions send the same token in an `Authorization` header, so every path here is asked as the same person.

One question is about what a private room is not. A private channel and a public channel of the same name are two rooms rather than one, and they have to be: a public channel is joined by name with no policy read, so a room shared between the two would mean anybody could join `lobby` and hear everything the policies were keeping them out of. The suite asks that in both directions, a private send and then a public one, because the interesting failure is the leak and the boring one is a private room hearing traffic it should not.

## What it does not ask

A push the write policies refuse is dropped in silence by Supabase Realtime and answered with an error on the push by zou. Both of those look identical to a listener, so the question here is the one they agree on, that nothing arrives. The difference is written down in zou's own docs, because a conformance suite that asserts a divergence stops being a record of what upstream does.

The batch endpoint's answer is asked as it is rather than as it should be. A batch with a refused message in it is 202 with nothing said about what was dropped, which is not much of an answer, and it is the answer clients are written against.

## Running it

The policies need a database, so this suite needs a server with one behind it, which the presence suite next door does not.

```
cd /path/to/zou
cargo run -p zou-conformance -- serve \
  --zou-dsn "postgres://postgres@127.0.0.1:5432/postgres" \
  --jwt-secret super-secret-jwt-token-with-at-least-32-characters-long \
  --setup /path/to/zou-conformance/js-realtime-private/setup.sql &

cd /path/to/zou-conformance/js-realtime-private
npm ci
npm test
```

Against a real local stack instead, which is the reason to trust the questions:

```
supabase start
psql "$DB_URL" -v ON_ERROR_STOP=1 -f setup.sql
ZOU_URL=http://127.0.0.1:54321 ZOU_ANON_KEY=<the anon key> npm test
```

Both legs run in CI. A failure against the stack a person gets is this repository having written down something Supabase Realtime does not do, and should be read as the suite being wrong rather than the server.
