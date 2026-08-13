# zou-conformance

The questions [zou](https://github.com/tamnd/zou) is measured against, and the answers the real Supabase binaries gave to them.

Nothing here is written by hand as an expectation. A suite is a list of requests, and next to it is a recording of what PostgREST or GoTrue answered when those requests were made against them, at the versions pinned in `versions.json`. zou passes a case when it answers the same way, and nobody has to decide which of the two is right for a difference to show up.

The harness that reads these files lives in the zou repository, in `conformance/`, and it is described in [docs/conformance.md](https://github.com/tamnd/zou/blob/main/docs/conformance.md). It is here as data rather than there because it is not zou's code: the derived suite is upstream's fixtures and upstream's questions, and a megabyte of somebody else's SQL does not belong in a repository whose point is the engine.

## What is in here

```
versions.json          what compatibility is measured against
suites/rest/           82 questions about the surface a supabase project uses
suites/postgrest/      1217 questions, derived from PostgREST's own spec files
suites/auth/           77 questions about the endpoints a sign in flow uses
suites/storage/        478 questions about buckets, objects, transforms and the S3 protocol
js/                    supabase-js's own integration tests, run against zou
js-storage/            storage-js's own integration tests, run against zou
js-tus/                tus-js-client driving resumable uploads, read back through supabase-js
js-realtime/           realtime-js driving presence and http broadcast, read back through supabase-js
js-realtime-private/   private channels, decided by policies a project writes itself
js-realtime-changes/   rows written over the api, read off a subscription, and the frames that carried them
demo/                  one of Supabase's example apps, unedited, in a browser
```

A suite is a directory:

```
setup.sql       the schema and the fixed rows, ending in a schema cache reload
reset.sql       the rows on their own, applied before every case that writes
cases.json      the questions
recorded.json   what the reference answered, per case
known.json      the cases zou answers differently, and why
fixtures/       what a case sends when its body is bytes rather than a line
```

`js/` and `js-storage/` are not suites in that shape and are described in [js/README.md](js/README.md) and [js-storage/README.md](js-storage/README.md). They are upstream's own test files run against zou, and they are the two places here where the assertions are somebody else's rather than a recording, because upstream wrote them about upstream's own clients.

`js-tus/` is a third shape and is described in [js-tus/README.md](js-tus/README.md). The questions and the assertions there are both ours, which nothing else here can say, because resumable uploads are a conversation between a client and a server and neither upstream repository points the one at the other. What keeps it honest is that the same file is run against a real `supabase start` as well as against zou: an assertion the reference does not pass is this repository being wrong.

`js-realtime/` is the same shape and is described in [js-realtime/README.md](js-realtime/README.md). Presence is the other thing nobody upstream points a client at: supabase-js's own suite has broadcast in it and no presence at all. So the questions are ours, asked through the real client because the client is half of the protocol, and run against `supabase start` as well for the same reason the tus suite is.
The broadcast file in it is there for a smaller reason: supabase-js's own suite sends over a socket and never over http, and the two ways a client sends without one are two different urls.

`js-realtime-private/` is the same shape again and is described in [js-realtime-private/README.md](js-realtime-private/README.md), and it is kept apart from the file next to it because it needs a database while presence and broadcast need none. A private channel is the one part of realtime whose answer is not in the server: it comes out of row level security policies on `realtime.messages` that a project wrote about its own tables, and `setup.sql` there is such a project, applied to both targets unedited.

`js-realtime-changes/` is described in [js-realtime-changes/README.md](js-realtime-changes/README.md), and it is about rows nobody sent: a table goes into the `supabase_realtime` publication, somebody writes to it over `/rest/v1`, and whoever subscribed is told. Every write goes through the api on purpose, because a suite holding a connection to the database could set a row up in a way no application could.
The last test in it is the only one here that reads frames rather than what a client handed the application, and it is the reason the file is not three more tests in the directory above: a server can fold correctly into the right object and still be sending frames upstream never sends, and `frames.json` is a recording of what Supabase Realtime sent for the same three writes.

`demo/` is not a suite either, and is described in [demo/README.md](demo/README.md). It is one of Supabase's example apps with nothing changed in it, driven through a real browser: sign up, sign in, a row level security policy holding between two accounts, and a Github login. A suite passing says every answer matched a recording. An app working says the answers were enough to build something on, and the second does not follow from the first.

The `rest` suite is hand written, about the endpoints and the headers a Supabase project actually uses. The `postgrest` suite is not written at all: `zou-conformance derive` reads a PostgREST checkout at the pinned version, walks the spec files its default test application runs, and turns every request it finds into a case. Only the request comes across. The `shouldRespondWith` next to it is read past on purpose, because an assertion copied from upstream only proves that somebody copied it.

The `auth` suite is hand written too, and it is the one where most of the answer cannot be the same twice. A token, a session id, an issued-at, a row's created_at: every one of them is different on the second run, and comparing them byte for byte would fail every case for a reason that is not a difference. Each case names the values that move, by json pointer, and a named value is compared as the shape it had rather than as what it said. Everything else is still compared byte for byte, and most of an auth answer is everything else.

## Using it

```
git clone https://github.com/tamnd/zou-conformance /tmp/zou-conformance
cd /path/to/zou
cargo run -p zou-conformance -- check \
  --suites /tmp/zou-conformance/suites \
  --zou-dsn postgresql://postgres@127.0.0.1:5432/postgres
```

zou's CI clones this repository at the commit pinned in `conformance/suites.json` and runs `check` on every push, so a change that makes zou answer differently fails there rather than here.

The database has to be on UTC. A timestamptz is rendered in the session's timezone, so the same binary answers `+00:00` on one machine and `+07:00` on another, and a recording cannot survive that. The harness reads the timezone before it asks anything and says so rather than scoring the difference.

## Recording

Recording is how a suite is created or refreshed, and it needs the reference binary on the machine.

```
cargo run -p zou-conformance -- record --suite postgrest \
  --suites /tmp/zou-conformance/suites \
  --url http://127.0.0.1:3998 \
  --dsn postgres://postgres@127.0.0.1:5433/pgrst_conf \
  --strip-prefix /rest/v1 --name "postgrest 14.15"
```

The diff in `recorded.json` is the review. It is upstream's answer written down, and if it is surprising then the case found something.

A bare GoTrue answers on `/` where a project answers on `/auth/v1`, so the auth suite is recorded with `--reference-strip /auth/v1` and the paths stay the ones a client actually types. It is recorded against the configuration `supabase start` gives a project that has changed nothing, with one exception: `GOTRUE_RATE_LIMIT_EMAIL_SENT` is raised out of the way. A rate limit is a configured number and a clock rather than a compatibility surface, and at the default of 30 an hour which case got the 429 would depend on how long the run before it took.

Bumping a version in `versions.json` means re-recording every suite it covers, and the re-recording is the point: the diff is upstream changing its mind, and it should be read rather than merged.

## Known differences

`known.json` names the cases zou answers differently today, with the reason. A known case still counts as a failure in the score. It is excused from the exit code and nothing else, because a scoreboard that forgives its own failures goes up when you write the excuse.

A known case that starts passing also fails the run. The list is meant to shrink, and the only way it shrinks is if the day an entry becomes wrong is a day CI complains.

## Where zou stands

The numbers move, so the file that has them is [docs/scoreboard.md](https://github.com/tamnd/zou/blob/main/docs/scoreboard.md), which CI regenerates on every merge out of what the run measured. Where it stood when this paragraph was written:

| suite | cases | zou passes | known |
| --- | ---: | ---: | ---: |
| rest | 82 | 82, 100% | 0 |
| postgrest | 1217 | 1217, 100% | 0 |
| auth | 77 | 74, 96% | 3 |
| storage | 478 | 478, 100% | 0 |

The supabase-js suite runs 17 of its 34 tests and zou passes all 17. The other 17 are Realtime, which zou does not serve yet. The storage-js suite runs 133 of its 135 and zou passes all 133, the other two being skips upstream wrote itself.

## Provenance

`js/` and `js-storage/` are derived from [supabase-js](https://github.com/supabase/supabase-js), which is MIT licensed, and each keeps upstream's licence next to it in `UPSTREAM-LICENSE`. `suites/storage/fixtures/sadcat.jpg` is the same file as `js-storage/test/fixtures/upload/sadcat.jpg` and comes from there: the image transform cases need a real image to transform, and transforming the one upstream's own tests use is one fewer thing to explain. `suites/storage/fixtures/sadcat.png` is that same cat, resized and saved as a png, and it is here because a jpeg cannot answer the question the format cases are asking: when nothing is said about the format, the answer is a jpeg either way, and only a source that is not a jpeg says whether that is the default or the format it was uploaded in.

`suites/postgrest` is derived from the test fixtures and spec files of [PostgREST](https://github.com/PostgREST/postgrest), which is MIT licensed. Upstream's licence is kept next to the files it covers, in `suites/postgrest/UPSTREAM-LICENSE`. The fixtures are upstream's with four differences, each noted at the top of `setup.sql`: the psql includes and variables are gone because the file is applied over a connection, the rows that arrived over `copy ... from stdin` are inserts, PostGIS is stripped a whole statement at a time, and two statements are swept up so the file can be applied twice to the same database.

Everything else here is Apache 2.0, see [LICENSE](LICENSE).
