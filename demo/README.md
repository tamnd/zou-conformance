# the demo app

One of Supabase's own example apps, unedited, pointed at zou and driven through a browser.

The suites next door ask a server questions. This asks an application. It is a different claim: a suite passing says every answer matched a recording, and an app working says the answers were enough to build something on. The second does not follow from the first, because an app uses the client library, and the client library reads headers, follows redirects, parses fragments and keeps a session in local storage, none of which a request by request comparison exercises.

## What it is

`app/` is `examples/todo-list/sveltejs-todo-list` from [supabase/supabase](https://github.com/supabase/supabase), at commit `840127cd6962d1b6a953c9b28201989ad6879be2`. Sign up and sign in with an address and a password, sign in with Github or Google, a todo list with a row level security policy on it, sign out.

The diff against upstream is one file that upstream does not ship: `app/.env`, which is the two variables its own `.env.example` asks for. Nothing else is touched. No test hook, no id added to a button, no module replaced. The url in that file is the port the Supabase CLI serves a local project on, and the key is the anon key the CLI prints, which zou accepts because it is signed with the same demo secret. An app configured for `supabase start` is configured for this.

`setup.sql` is upstream's own migration for the same table, from the todo list quickstart the app's README tells you to run.

`stub-github.mjs` is the one thing here that is not real, and it is not part of the app. Read on.

## Running it

Three servers: a database, zou in front of it, and the app.

```
createdb zoudemo

cd /path/to/zou
ZOU_EXTERNAL_GITHUB_CLIENT_ID=demo-client \
ZOU_EXTERNAL_GITHUB_SECRET=demo-secret \
ZOU_EXTERNAL_GITHUB_URL=http://127.0.0.1:54399 \
  cargo run -p zou-conformance -- serve \
    --zou-dsn postgresql://postgres@127.0.0.1:5432/zoudemo \
    --setup /path/to/zou-conformance/demo/setup.sql &

cd /path/to/zou-conformance/demo
npm ci
npm run install:app
npx playwright install chromium
npm test
```

The app and the stub provider are started by the test run itself. `npm --prefix app run dev` serves it by hand instead, at `http://localhost:5173`, which is worth doing once: the point of an app is that somebody can use it.

`install:app` is `npm ci --legacy-peer-deps`, and the flag is not optional. Upstream's `package.json` pins vite 4 next to a svelte plugin that asks for vite 3, so npm's default resolution refuses to install it at all. That is upstream's dependency graph rather than anything changed here, and the build is fine. The lockfile is generated rather than upstream's, because upstream does not ship one.

`npm run build` writes `app/src/app.css`, which upstream checks in empty and tailwind fills. A modified file there after a run is generated css, not an edit.

## What the tests check

Four, in `tests/demo.spec.js`, each of them something a person does:

- Signing up gets an account, a session and an empty list, and a todo added to it is still there after a reload, which is the row having gone to the server and come back rather than having only ever been in the page.
- One account cannot see another account's todos. Two accounts, one row each, and each of them sees one row. The policy is `auth.uid() = user_id` and nothing in the app filters by user, so a leak here is a leak.
- The anon key on its own reads nobody's todos. That key is in the javascript bundle, which means everybody has it, and the policy is the only thing between it and the table.
- Signing in with Github twice lands on the same account. The identity is keyed by the provider's id for somebody rather than by their address, so the second sign in has to find the first account and not make one that looks like it.

## The stub provider

An OAuth login cannot be clicked in a test against github.com. There is no account to sign in as, no consent to give, and nothing that still works in six months.

So `stub-github.mjs` stands where github does. It is reached the way a GitHub Enterprise install is reached, through `ZOU_EXTERNAL_GITHUB_URL`, which is GoTrue's variable for the same thing and is configuration rather than a test seam: the same four endpoints, the same shapes, the same two calls to find an address that github keeps out of the profile document. What it does not do is show a consent screen, because there is nobody to consent.

Everything on zou's side of that is the real path. The code is exchanged over http, the profile and the address list are read and merged, the account and the identity row are made from what they say, the session comes back in the url fragment, and the client library parses it out and signs the person in. The button in `Auth.svelte` is upstream's, and it says `signInWithOAuth({ provider: 'github' })`.

## Provenance

`app/` and `setup.sql` come from [supabase/supabase](https://github.com/supabase/supabase), which is Apache 2.0 licensed. Upstream's licence is in `UPSTREAM-LICENSE`.
