# zou-conformance

The questions [zou](https://github.com/tamnd/zou) is measured against, and the answers the real Supabase binaries gave to them.

Nothing here is written by hand as an expectation. A suite is a list of requests, and next to it is a recording of what PostgREST or GoTrue answered when those requests were made against them, at the versions pinned in `versions.json`. zou passes a case when it answers the same way, and nobody has to decide which of the two is right for a difference to show up.

The harness that reads these files lives in the zou repository, in `conformance/`, and it is described in [docs/conformance.md](https://github.com/tamnd/zou/blob/main/docs/conformance.md). It is here as data rather than there because it is not zou's code: the derived suite is upstream's fixtures and upstream's questions, and a megabyte of somebody else's SQL does not belong in a repository whose point is the engine.

## What is in here

```
versions.json          what compatibility is measured against
suites/rest/           82 questions about the surface a supabase project uses
suites/postgrest/      1233 questions, derived from PostgREST's own spec files
```

A suite is a directory:

```
setup.sql       the schema and the fixed rows, ending in a schema cache reload
reset.sql       the rows on their own, applied before every case that writes
cases.json      the questions
recorded.json   what the reference answered, per case
known.json      the cases zou answers differently, and why
```

The `rest` suite is hand written, about the endpoints and the headers a Supabase project actually uses. The `postgrest` suite is not written at all: `zou-conformance derive` reads a PostgREST checkout at the pinned version, walks the spec files its default test application runs, and turns every request it finds into a case. Only the request comes across. The `shouldRespondWith` next to it is read past on purpose, because an assertion copied from upstream only proves that somebody copied it.

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

Bumping a version in `versions.json` means re-recording every suite it covers, and the re-recording is the point: the diff is upstream changing its mind, and it should be read rather than merged.

## Known differences

`known.json` names the cases zou answers differently today, with the reason. A known case still counts as a failure in the score. It is excused from the exit code and nothing else, because a scoreboard that forgives its own failures goes up when you write the excuse.

A known case that starts passing also fails the run. The list is meant to shrink, and the only way it shrinks is if the day an entry becomes wrong is a day CI complains.

## Where zou stands

The `rest` suite is 82 cases and zou passes 71 of them, 86%, with 11 known differences.

The `postgrest` suite is 1233 cases and zou passes 589 of them, 47%, with 644 known differences. That number is meant to be uncomfortable. It asks everything upstream asks itself, including the parts of PostgREST nobody using Supabase has ever typed, and the gap is a small number of missing features rather than 644 separate bugs. It is broken down in [tamnd/zou#118](https://github.com/tamnd/zou/issues/118).

## Provenance

`suites/postgrest` is derived from the test fixtures and spec files of [PostgREST](https://github.com/PostgREST/postgrest), which is MIT licensed. Upstream's licence is kept next to the files it covers, in `suites/postgrest/UPSTREAM-LICENSE`. The fixtures are upstream's with four differences, each noted at the top of `setup.sql`: the psql includes and variables are gone because the file is applied over a connection, the rows that arrived over `copy ... from stdin` are inserts, PostGIS is stripped a whole statement at a time, and two statements are swept up so the file can be applied twice to the same database.

Everything else here is Apache 2.0, see [LICENSE](LICENSE).
