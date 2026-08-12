# the private channel suite

A private channel, asked through the client that subscribes to one, against policies a project wrote itself.

This is the only part of realtime whose answer is not in the server. A channel with `private: true` on it is allowed or refused by ordinary row level security policies on `realtime.messages`, and those policies are sql a project writes about its own tables, reading `realtime.topic()` for the room and `auth.uid()` for the person. `setup.sql` here is what such a project looks like: a membership table, a row per person per room, a flag for whether that membership may send, and two policies that read it. Both targets get it unedited, so a disagreement between them is a disagreement about the server rather than about the fixture.

The person is minted here rather than signed up through GoTrue, because a policy reads claims and nothing else. The client carries it through the `accessToken` option, which is the same token the socket sends in its join and the http endpoints see in an `Authorization` header, so all three paths are asked as the same person.

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
