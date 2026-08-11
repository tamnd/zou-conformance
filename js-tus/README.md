# the tus suite

Resumable uploads, driven by the client Supabase tells people to use.

Every other suite in this repository is one of two things. A question we wrote and an answer a reference binary gave, recorded and compared byte for byte. Or somebody else's test file, run unedited, where the questions and the assertions are both theirs.

This one is neither, because there is nothing to copy. tus-js-client's own tests are about the client, storage-api's are about the server, and nobody upstream ships a suite that points the one at the other. So the questions here are ours, written the way the Supabase documentation writes a resumable upload: tus-js-client aimed at `/storage/v1/upload/resumable`, the session token in a header, and the destination in the upload metadata.

The assertions are read back through supabase-js rather than through another raw request, because the claim being made is that an object uploaded this way is an ordinary object. The same client that would have called `upload()` downloads it, lists it, and sees its size and its type.

## Why it is worth running

What it catches, and a recorded case cannot, is everything about the protocol that is a conversation rather than an answer.

A client picks its own chunk boundaries. It asks where it got to after an interruption and believes the number it is told. It sends the offset it believes in and gives up if the server contradicts it. A second process, given nothing but a url, finishes what the first one started. None of that is visible one request at a time, which is exactly what the recorded storage suite is: 60 cases about this endpoint, every one of them a request and an answer, and all 60 of them sent with the service key.

That last part is how this suite earned its keep on the day it was written. The documented flow uses a signed in user's access token, not the service key, and nothing had ever asked zou to do that. It refused: the tables a resumable upload keeps its bookkeeping in have row level security on and no policy written about them, so every insert an ordinary user made was refused before a byte moved, [tamnd/zou#283](https://github.com/tamnd/zou/issues/283).

## Running it

zou serves this from the conformance harness in the zou repository:

```
cd /path/to/zou
cargo run -p zou-conformance -- serve \
  --zou-dsn postgresql://postgres@127.0.0.1:5432/zoutus \
  --setup /tmp/zou-conformance/js-tus/setup.sql &

cd /tmp/zou-conformance/js-tus
npm ci
npm test
```

Against a real local stack instead:

```
supabase start
psql "$CLI_DSN" -f setup.sql
ZOU_URL=http://127.0.0.1:54321 ZOU_ANON_KEY=<the anon key> npm test
```

Both are run in CI on every change to zou, the first as its own job and the second inside the job that brings up `supabase start`. That second run is the point: a suite whose assertions are ours is only worth something if the reference passes them too, so a failure there is this repository having written down something storage-api does not do.

## What it asks

12 tests, and they are about four things.

| block | what it asks |
| --- | --- |
| an upload that goes through in one piece | the object is ordinary afterwards, its type is what the metadata said, a public bucket serves it to nobody in particular |
| an upload that takes several requests | three chunks arrive in order and reassemble, and nothing is an object until the last byte lands |
| an upload that was interrupted | a second client given only the url picks up from the offset the server reports, and a terminated upload is gone |
| what it refuses | no token, a name that is taken unless upsert says otherwise, more bytes than the bucket takes, a bucket that is not there |

The bytes are a pattern that differs at every offset, so a chunk delivered twice or in the wrong order is a mismatch rather than a coincidence.

One thing is deliberately not asked, and running this against the reference is how that was settled. Every upload here sends `cacheControl` in its metadata, and the reference gives two answers about it for the same object: the row a listing reads says `max-age=3600`, and the info route says `no-cache`. They come from different places upstream, the database row and the stored file's own headers, and they disagree. zou keeps one value and says `no-cache` in both places, so this suite says nothing about cache control and leaves the question in [tamnd/zou#285](https://github.com/tamnd/zou/issues/285). The info route's answer is pinned in the recorded storage suite next door either way.

## The fixture

`setup.sql` is ours, since there is no upstream one to take. Two buckets, one account, and the four policies that let that account write and read what it wrote.

The account is seeded rather than signed up over the api, so the suite can be pointed at a server with signups shut. The private bucket has a ceiling of 10 MB, well under the 52 GB the endpoint announces in `tus-max-size`, because one of the questions is which limit answers first.
