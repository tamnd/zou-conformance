# the chat demo

Supabase's own realtime example app, unedited, pointed at zou and driven through two browsers at once.

The demo next door asks whether an application can be built on the answers. This asks the other half: whether an application can be built on the frames. A suite compares a frame with a recording, one at a time, and every one of them can match while the thing a person is looking at never changes. Two browsers is the only way to ask the question the way it is felt, which is somebody typing and somebody else seeing it.

## What it is

`app/` is `examples/slack-clone/nextjs-slack-clone` from [supabase/supabase](https://github.com/supabase/supabase), at commit `9be60cab63161100500bdae6dfd45501c5fd8b07`. Sign up with an address and a password, a channel per room, a message per line, delete your own, and an admin who can delete anybody's.

The diff against upstream is one file that upstream does not ship: `app/.env`, holding the four variables its own `.env.example` asks for. Nothing else is touched. No test hook, no id added to a button, no module replaced. The url in that file is the port the Supabase CLI serves a local project on and the key is the anon key the CLI prints, which zou accepts because it is signed with the same demo secret.

The one thing that is not in `app/` and has to be beside it is `sass`. The app's stylesheet is `.scss` and next compiles it with a package upstream's `package.json` does not depend on, so an install of the app on its own cannot build it. It is a dependency of this directory instead, which node finds by walking up out of `app/`, and the app's own files stay upstream's.

The schema is the app's own too, in `app/supabase/migrations`, and it is applied rather than transcribed:

```
for f in app/supabase/migrations/*.sql app/supabase/seed.sql
do cat "$f"; printf '\n;\n'
done > /tmp/chat-setup.sql
```

The separator is not decoration. The Supabase CLI applies each of these files on its own and the last statement in one of them has no semicolon after it, so a plain `cat` runs it into the first line of the next file. The extra semicolons are empty statements, which postgres accepts.

## Running it

Two servers: a database with zou in front of it, and the app.

```
createdb zouchat

cd /path/to/zou
ZOU_HOOK_CUSTOM_ACCESS_TOKEN_ENABLED=true \
ZOU_HOOK_CUSTOM_ACCESS_TOKEN_URI=pg-functions://postgres/public/custom_access_token_hook \
  cargo run -p zou-conformance -- serve \
    --zou-dsn postgresql://postgres@127.0.0.1:5432/zouchat \
    --setup /tmp/chat-setup.sql &

cd /path/to/zou-conformance/demo-realtime
npm ci
npm run install:app
npx playwright install chromium
npm test
```

The database has to be able to decode logically, `wal_level = logical`, because a change reaches a browser by being read out of the write ahead log.

The two hook variables are the app's `supabase/config.toml` read out loud. It enables the custom access token hook and points it at `public.custom_access_token_hook`, the function the app's second migration installs, and zou takes the same uri in an environment variable because it has no `config.toml` to read. Without it the app still works and one test does not: the admin's claim is minted by that function.

`install:app` is `npm ci --legacy-peer-deps`, and the flag is not optional here either. The lockfile is generated rather than upstream's, because upstream does not ship one.

`npm --prefix app run dev` serves it by hand instead, at `http://localhost:3000`, which is worth doing once with two windows open side by side. That is the whole point of this app.

## What the tests check

Five, in `tests/chat.spec.js`, each of them two people in a room:

- A message one person sends arrives on the other person's screen, with the author's name on it, and the page it arrives on is the page that was already open. Every test carries a mark on the window that a reload would wipe, so "without a reload" is asserted rather than implied.
- A message taken back disappears from the other screen too. The tables are `replica identity full`, so a delete publishes the whole old row and what a subscriber is sent of it is cut to the key.
- A channel one person makes appears in the other's sidebar, and it is a room rather than a name: the second person walks into it and sends the first message.
- The key in the javascript bundle hears nothing it may not read. A third browser with no session sits in the same channel holding the anon key, subscribed to the same three tables, and the message the other two are passing never reaches it. The same question is asked of the api directly, because a socket that sends nothing and a page that renders nothing are two different failures.
- An admin can take back a message that is not theirs. The project decides who is an admin in a trigger, writes it into its own table, and hands it to the token in a postgres function that zou calls while minting. The policy that allows the delete reads that claim back with `auth.jwt() ->> 'user_role'`.

## Provenance

`app/` comes from [supabase/supabase](https://github.com/supabase/supabase), which is Apache 2.0 licensed. Upstream's licence is in `UPSTREAM-LICENSE`.
