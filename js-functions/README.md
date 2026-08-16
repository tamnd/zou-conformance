# the functions suite

A project's edge functions, deployed nowhere and changed in no way, asked of both servers.

There is no upstream test file to copy here. supabase-js has one line about functions in its own suite and edge-runtime's tests are about the runtime rather than about the surface a project sees, so the questions are ours, written the way the documentation writes a function: a directory per function under `functions/`, an `index.ts` in each, `_shared` beside them, and a `config.toml` whose only entry turns `verify_jwt` off for one of them.

What keeps ours honest is the same thing that keeps the tus and presence suites honest: every question is asked of a real `supabase start` as well as of zou, in the same CI run. An assertion the reference does not pass is this repository being wrong about Supabase rather than zou being wrong about anything.

`functions/` is the project. It is copied into a `supabase/functions` for the reference and served out of a `supabase/functions` by `zou functions serve`, and neither copy is edited on the way in.

## What is asked

`entry.test.ts` is the three ways a module says what to run. `Deno.serve` is the one in the documentation, `export default { fetch }` is what a smaller set of functions in the wild use, and `serve()` imported from std is what most of the older examples use because they predate the other two. A runtime that took only the documented one would refuse most of the functions people already have, so all three are deployed and all three are called. The two questions after them are the path and the method: the name is the first segment and everything after it is the function's, query string included, and every method reaches the handler with its body.

`invoke.test.ts` is the invocation. supabase-js's own `functions.invoke`, the three refusals, the two error pages, and `waitUntil`. The refusals are three rather than one because the server tells them apart before it verifies anything: no header at all, a string that is not a token, and a token that is shaped like one and signed with something else are three different codes in `sb-error-code` and three different messages in the body.

`runtime.test.ts` is what the function is given. The five environment variables a project is promised, the web surface a handler is written against, a body that arrives in pieces as the handler writes them rather than in one piece at the end, the headers describing the request that reached the front door, and CORS.

## The two divergences

Three of the questions have two right answers, and both of them are written down rather than skipped. A suite that skipped them would be a suite that stopped noticing the day one of the two changed.

A preflight is answered by kong on the local stack, before the function is reached, and kong answers `*` whatever the function would have said. zou hands the preflight to the function the way the hosted runtime does, so the `_shared/cors.ts` that is in every Supabase example is the thing deciding. Both answer 200 with `*` for a project that has not changed that file, which is why this is a divergence and not a difference anybody sees.

`SB_EXECUTION_ID` is a uuid on both. The local stack mints it when the worker is made rather than when a call arrives, so every call into a kept worker sees the same one: five calls a second apart were measured returning one id. zou mints it per call, which is what the name says and what a log line naming an execution is only useful as.

## Running it

zou needs no database for this. A project directory with the `config.toml` and the `functions` from here, and the dev loop:

```
mkdir -p /tmp/fnproj/supabase
cp -r /tmp/zou-conformance/js-functions/functions /tmp/fnproj/supabase/functions
cp /tmp/zou-conformance/js-functions/config.toml /tmp/fnproj/supabase/config.toml

cd /tmp/fnproj
zou functions serve --port 54321

cd /tmp/zou-conformance/js-functions
npm ci
ZOU_ANON_KEY=<the anon key that command printed> npm test
```

The reference is the same project with `supabase start`, with edge-runtime not excluded, and `ZOU_REFERENCE=1` set so that the two divergences above are asserted against what that server does:

```
cd /tmp/fnref
supabase start -x studio,imgproxy,logflare,vector
eval "$(supabase status -o env | sed 's/^/export /')"

cd /tmp/zou-conformance/js-functions
ZOU_REFERENCE=1 ZOU_ANON_KEY="$ANON_KEY" npm test
```
