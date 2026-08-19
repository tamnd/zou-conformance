# the demo functions app

Supabase's own edge functions example, unedited, with its functions deployed to a zou store and invoked from a browser.

The two demos next door ask whether an application can be built on the answers and on the frames. This one asks the longest chain in the product: a click goes through the client library to a gateway, the gateway builds an isolate out of blobs in an object store, the function inside it imports a package off a registry, the package calls the same server's rest api with the browser's own access token, and postgres decides what that person is allowed to see. Every link is a different subsystem and none of them is stubbed.

## What it is

`app/` and `supabase/` are `examples/edge-functions` from [supabase/supabase](https://github.com/supabase/supabase), at commit `9be60cab63`. The app lists the functions it can invoke, edits a json body in a text area, invokes and prints what came back. The functions are upstream's own: `browser-with-cors` answers a greeting and handles its own preflight, `select-from-table-with-auth-rls` verifies the caller and selects from a table with a policy on it, and `send-email-smtp` is listed and never invoked here, because a demo that needs an SMTP server is a demo of somebody else's SMTP server.

The diff against upstream is one file upstream does not ship: `app/.env`, which is the two variables its own `.env.example` asks for. Nothing else is touched. No test hook, no id added to a button, no module replaced. The url in that file is the port the Supabase CLI serves a local project on and the key is the anon key the CLI prints, which zou accepts because it is signed with the same demo secret. An app configured for `supabase start` is configured for this.

`setup.sql` is the table the function selects from, with the policy the function's own README describes: a `public.users` row per account, and `auth.uid() = id` as the whole policy, so two people asking the same function the same question get one row each and it is not the same row.

`mint.mjs` signs a project key for a role out of the project's secret, which is what the postgres port takes as a password and what the admin api takes as a bearer.

## What is not the browser's

Accounts are made through `POST /auth/v1/admin/users` rather than through the sign up form. A node serving projects out of a registry has no mail settings of its own yet, so a sign up in the browser ends at a confirmation nobody can send: [zou#488](https://github.com/tamnd/zou/issues/488). Everything after the account exists is the browser's own, including the sign in.

## Running it

Three servers: a database, zou in front of it serving what was deployed, and the app.

```
initdb -D /tmp/demo-functions-pg -U postgres
pg_ctl -D /tmp/demo-functions-pg -o "-p 54322" start

cd /path/to/zou
export ZOU_JWT_SECRET=super-secret-jwt-token-with-at-least-32-characters-long
cargo run -p zou --features zou-deno/isolate -- tenant /tmp/demo-functions-store create demo --secret "$ZOU_JWT_SECRET"

cd /path/to/zou-conformance/demo-functions
cargo run --manifest-path /path/to/zou/Cargo.toml -p zou --features zou-deno/isolate -- \
  functions deploy --target /tmp/demo-functions-store --ref demo
cargo run --manifest-path /path/to/zou/Cargo.toml -p zou --features zou-deno/isolate -- \
  functions serve --port 54321 --target /tmp/demo-functions-store --ref demo &

curl -s -o /dev/null "http://127.0.0.1:54321/rest/v1/" -H "apikey: $(node mint.mjs anon "$ZOU_JWT_SECRET")"
./setup.sh

npm ci
npm run install:app
npx playwright install chromium
npm test
```

The `curl` is not decoration. zou installs the auth schema on the first connection it takes out of its pool, and `setup.sql` puts a trigger on `auth.users`, so the order matters once.

The app is started by the test run itself, built rather than served from source, because what a project ships is the build. `npm --prefix app start` serves it by hand instead, which is worth doing once: the point of an app is that somebody can use it.

## What it checks

Six tests, all of them things visible on the page.

- the app is upstream's own, listing upstream's four options in upstream's order
- a signed in person invokes a deployed function and reads the greeting it wrote
- the function answers with the claims it verified, and they are the person at the browser
- two accounts invoke the same function against the same table and see one row each, and it is not the same row
- an anon key is not a person, and the function says so rather than answering
- the invoke is cross origin, so the browser preflights it and the function answers the preflight

The first invoke in a run is slow in a way the rest are not: a function is built the first time somebody asks for it, and the build fetches what the function imports.

## Why deployed rather than served

`zou functions serve` in a project directory reads the files on the disk beside it. That is the dev loop, and it is covered by the `js-functions` suite. This one deploys first, so what runs came out of a store: a manifest, blobs addressed by their hashes, and a materialize step on the way in. It is the path a hosted project takes and the one nothing else here exercises.

## The upstream license

`app/` and `supabase/` are Apache-2.0, and `UPSTREAM-LICENSE` is the copy that came with them.
