# the storage-js suite

storage-js's own integration tests, pointed at something other than supabase.

The second suite here of that kind, and for the same reason as the first. Everywhere else in this repository we ask the questions and a reference binary answers, and the answer becomes the expectation. These two are the other way round: upstream wrote the questions and the assertions, about a client they maintain, against the stack `supabase start` brings up. That is a written statement of what the client needs from a storage server, and it is worth running unchanged rather than paraphrasing into questions of our own.

storage-js is not published on its own release cycle. It lives at `packages/core/storage-js` in [supabase-js](https://github.com/supabase/supabase-js) and goes out with it, which is why the version in `versions.json` is the same 2.111.0 the `js` suite pins.

## Running it

zou serves this from the conformance harness in the zou repository:

```
cd /path/to/zou
cargo run -p zou-conformance -- serve \
  --zou-dsn postgresql://postgres@127.0.0.1:5432/zoustorage \
  --setup /tmp/zou-conformance/js-storage/setup.sql &

cd /tmp/zou-conformance/js-storage
npm ci
npm test
```

`serve` starts zou on port 54321, the port the supabase CLI serves a local project on, which is the url the tests have hard coded. It applies the fixture only once it has made zou take a connection, because zou creates the storage and auth schemas on its first one and the fixture writes rows into both.

Against a real local stack instead, which is what upstream runs:

```
supabase start
npm test
```

Nothing has to be passed for either. The url and the service key in these files are the CLI's own defaults, unedited, and zou's harness mints a key the CLI's secret verifies.

## The plumbing

Three files of it, and they exist because the tests are run out of the published package rather than out of a checkout of upstream.

`@supabase/storage-js` ships its `src/` next to its `dist/`, so the tests can be copied here as they are, `import { StorageClient } from '../src/index'` and all, and `jest.config.js` maps `../src` onto the package's own sources. Nothing is rewritten to import the package by name, so the diff against upstream stays readable as a diff.

The runner is jest, where the `js` suite next door uses vitest. The snapshot file is jest's, written by jest's serializer, and a snapshot is an expectation like any other here: running it under something that writes the file in a different shape would be editing upstream's assertions rather than checking them.

`ts-jest` runs with `diagnostics: false`. TypeScript resolves `../src/index` before jest's mapper gets to it and cannot be told otherwise, since `paths` does not apply to relative specifiers. The types are not what is under test, the server is.

## What runs

135 tests across four files, 133 passing and 2 skipped, plus 6 snapshots.

| file | what it asks |
| --- | ---: |
| `storageApi.test.ts` | the bucket api end to end, with the snapshots |
| `storageBucketApi.test.ts` | the bucket api's error paths and the urls the client builds |
| `storageFileApi.test.ts` | upload, download, list, move, copy, remove, signed urls |
| `storageFileApiNode.test.ts` | the node stream and buffer paths |

The two skipped are upstream's own, one for webp negotiation and one for `format: 'origin'`.

Three more were gated behind an environment flag while `/storage/v1/render/image` was the part of the storage api zou did not serve, [tamnd/zou#3](https://github.com/tamnd/zou/issues/3), since a suite that fails on a feature nobody has written measures nothing. They were skipped rather than deleted, and they run now:

```
ZOU_IMAGE_TRANSFORMS=1 npm test
```

One of them earned its keep the day it stopped being skipped. It reads `x-transformations`, the header a render carries saying what it was asked to do, and no recorded case had ever compared it: the harness compares a fixed list of headers and that one was not on the list. The recording that followed is where the ceiling on a side, quietly two thousand, came from.

That flag and the comment above it are the entire diff against upstream. No assertion is edited.

## The fixture

`setup.sql` is upstream's `test/supabase/seed.sql`, which the CLI applies during `supabase db reset` and which is applied over a connection here because there is no CLI in the loop. Five buckets, one of them for the move tests, twenty objects, two accounts, and ten policies, several of them going through `storage.foldername`. The policies are half of what the object tests are asking about, so they are upstream's verbatim.

Two things are added at the top. The drops, so the file can be applied twice to the same database. And `set storage.allow_delete_query`, because the storage schema carries a trigger that refuses a delete which did not come from the storage api, and the reset has to go around it the same way `suites/storage/reset.sql` does.

The account passwords are hashed with `crypt` and `gen_salt`, unqualified, which is a fair thing for a seed file to expect and did not resolve until zou grew the `extensions` schema, [tamnd/zou#214](https://github.com/tamnd/zou/issues/214). A fixture written by somebody else is a good way to find out what a database is missing.

## Provenance

The files under `test/` and `setup.sql` are derived from [supabase-js](https://github.com/supabase/supabase-js), which is MIT licensed. Upstream's licence is next to them in `UPSTREAM-LICENSE`.
