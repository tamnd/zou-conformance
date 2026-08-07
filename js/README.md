# the supabase-js suite

supabase-js's own integration tests, pointed at something other than supabase.

Everything else in this repository is a recording: we ask the questions, the reference answers, and the answer is the expectation. This one is the other way round. Upstream wrote both the questions and the assertions, about the client they maintain, against the stack `supabase start` brings up. That makes it the closest thing there is to a written statement of what the client needs from a server, and the only case here where an assertion copied from upstream proves anything.

So it is copied, and the diff against upstream is five lines of plumbing, listed at the top of `integration.test.ts`. No assertion is edited. A failure here is zou answering differently from the server the test was written against.

## Running it

zou serves this from the conformance harness in the zou repository:

```
cd /path/to/zou
cargo run -p zou-conformance -- serve \
  --zou-dsn postgresql://postgres@127.0.0.1:5432/zoujs \
  --setup /tmp/zou-conformance/js/setup.sql &

cd /tmp/zou-conformance/js
npm ci
npm test
```

`serve` starts zou on port 54321, the port the supabase CLI serves a local project on, and applies the fixture. It applies it only once it has made zou take a connection, because zou installs the auth schema on its first one and `todos.user_id` is a foreign key into `auth.users`.

Against a real local stack instead, which is what upstream runs and what the recording of any future suite here would come from:

```
supabase start
npm test
```

Nothing has to be passed for that: the defaults in the file are the CLI's own url and anon key. Somewhere else, set `ZOU_URL`, `ZOU_ANON_KEY` and `ZOU_JWT_SECRET`.

## What runs

17 of the 34 tests. The client constructs, the PostgREST block, the RLS block, the Authentication block, the Storage block and the timeout configuration block, and all 17 pass against zou today.

The Storage block is the newest of them and it is the one that proves something the recorded storage suite cannot: it uploads, lists and removes through storage-js with the anon key, so the policy on `storage.objects` is doing the deciding rather than a service role going around it.

The 17 that are skipped are the Realtime blocks and the custom JWT realtime test. zou serves no Realtime on this url yet, [tamnd/zou#4](https://github.com/tamnd/zou/issues/4), and a suite that fails on a feature nobody has written measures nothing. They are skipped by an environment flag rather than deleted, so the day it lands the tests run exactly as upstream wrote them:

```
ZOU_REALTIME=1 npm test
```

## The fixture

`setup.sql` is upstream's migrations and seed in one file, since there is no CLI here to apply them separately. Five todos, RLS on, anon reads and writes everything, authenticated sees only its own rows, and the bucket the Storage block uploads into with the policy that lets an anon key do it. The two changes are noted at the top of the file, both so it can be applied twice to the same database.

## Provenance

`integration.test.ts` and `setup.sql` are derived from [supabase-js](https://github.com/supabase/supabase-js), which is MIT licensed. Upstream's licence is next to them in `UPSTREAM-LICENSE`.
