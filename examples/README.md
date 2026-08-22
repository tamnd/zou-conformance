# examples

The Supabase examples project, served by both servers, every function in it asked the same question.

This is not a suite and nothing in CI runs it.
A suite is a list of questions with a recording next to it, and a case either matches or it does not.
The corpus is the other kind of measurement: forty two functions somebody else wrote, most of which need a secret nobody here has and half of which fetch what they import off the network at boot.
There is no pass in it.
What there is instead is a denominator, and a reason next to every name that is not shared.

## The question

A POST with an empty json body and the project's anon key.
That is the smallest question that reaches a handler, and a function that wants an OpenAI key and says so has still run.

A function ran when its own code or its own library produced the outcome: a refusal from the gateway in front of it, a config error out of a library it imports, a throw from the handler.
A function did not run when the module never finished loading, or when it reached for a runtime api that is not there.
Which of the two happened is read off the server log rather than off the status, because from the outside both of them are a 500.

That line is the whole measurement, so it is worth being blunt about what it does not say.
A function that ran did not necessarily do anything useful.
Nineteen of the thirty two zou ran stopped at a 401 in front of the handler, and six more got as far as a library saying it has no api key.
The claim being made is that the runtime got the code to its own first decision, and not that the example works.

## Running it

```
examples/corpus.sh /tmp/exproj
```

Lays the project out at `/tmp/exproj/supabase` from a checkout of `supabase/supabase` at the commit in `measured.json`.
The project is not vendored here: it is somebody else's code, it moves, and pinning the commit is the part that matters.

Then serve it with one server and ask:

```
zou functions serve --config /tmp/exproj/supabase/config.toml --port 54341
examples/probe.sh http://127.0.0.1:54341 "$ANON_KEY" /tmp/exproj/supabase /tmp/exproj/zou.tsv
```

and with the other:

```
cd /tmp/exref && supabase start
examples/probe.sh http://127.0.0.1:54321 "$ANON_KEY" /tmp/exref/supabase /tmp/exref/ref.tsv
```

`node compare.mjs` prints what the recording adds up to, and `node compare.mjs /tmp/exproj/zou.tsv` prints where a fresh run has moved away from it.
A status that moved is either zou getting further or a library on the network changing under both servers, and either way it is a line somebody should read.

## What was measured

40 functions asked, the reference on 2026-08-17 and zou on 2026-08-22.
zou ran 34 of them, the reference ran 34, and they agree on 31.
Twenty six of the forty answer the same status with the same bytes on both servers.

Where the 40 comes from, since a number about a corpus is mostly a number about who was counted.
There are 42 directories under `functions/` and 39 of them have an `index.ts`: `_shared`, `mcp` and `unit-testing` have no entrypoint of their own and are not functions.
`config.toml` adds a fortieth name that has no directory at all, `simple-mcp-server`, whose entrypoint it points two levels down at `functions/mcp/simple-mcp-server/index.ts`.

One of the forty is asked of one server only, and the reason is the most interesting row in the file.
`wasm-modules` imports `add-wasm/pkg/add_wasm.js`, which a wasm build writes and which is not in the checkout, so on both servers there is nothing to load.
zou serves the other thirty nine and answers 500 for that one.
The CLI reads the whole project before it starts anything and refuses to bring the stack up at all while the function is in the directory, so the reference copy has the function taken out of it, which is the only way to ask upstream about the rest of the project.

Five sentences are shared and byte for byte identical on both servers, out of the same libraries, and six functions land on them:

```
Missing API key. Pass it to the constructor `new Resend("re_123")`
Missing credentials. Please pass an `apiKey`, ... or set the `OPENAI_API_KEY` ...
Please pass in your ElevenLabs API Key or export ELEVENLABS_API_KEY in your environment.
Neither apiKey nor config.authenticator provided
Empty token!
```

Those are the most useful rows in the file.
They are third party npm packages, resolved and loaded and run far enough to make a decision about their own configuration, and the two runtimes reached the same sentence.

`measured.json` has the rest: both servers' status, the first 300 bytes of both bodies, the log line that decided the verdict, and the verdict.

## What the key maps moved

Most of this corpus goes through `npm:@supabase/server` now, which builds a client out of the environment before the handler runs and refuses the request if it cannot find a key.
zou set four variables and upstream sets more, and the two the library wants are `SUPABASE_PUBLISHABLE_KEYS` and `SUPABASE_SECRET_KEYS`, each a json object with a `default` in it.

Setting them moved five answers, and none of the five is a function that started running: all five were already running and refusing.
Four now answer what the reference answers, byte for byte, which took the identical count from sixteen to twenty: `cloudflare-turnstile`, `get-tshirt-competition`, `sentry` and `elevenlabs-speech-to-text`.
The fifth, `custom-jwt-validation`, gets past the client it could not build and reaches `AbortSignal.timeout`, which zou did not have, so it answered 401 with a `TypeError` where the reference answers 401 with a `JOSENotSupported`.
That is a runtime gap the corpus could not see until the environment stopped hiding it.

## What the signal and the copy moved

`AbortSignal.timeout`, `AbortSignal.any` and `AbortSignal.abort` are there now, and a signal handed to a `fetch` or to a `Request` ends the call.
`structuredClone` is there now too.
Between them they moved one answer and no others, and it is the same answer twice: `custom-jwt-validation` asked for the signal, then asked for the copy, and now runs the whole way to the same refusal upstream reaches, out of the same library for the same reason.

The two bodies still differ, by the name of the error class and nothing else.
Upstream says `JOSENotSupported` and zou says `I`, because jose names an error after the class that threw it and esm.sh serves that class minified.
That is the registry rather than the runtime, and it is the kind of difference that is worth writing down rather than counting as agreement: the identical count was still twenty of forty after it.

## What the park moved

zou was asked again on 2026-08-19 and the reference column was left alone, because nothing about the other server changed and it was not started for this.

Two names moved and both are the same fix, which is that a module whose last line is `await app.listen({ port: 8000 })` now boots.
That shape never finishes evaluating, because what it waits for is a request and the request is waiting for the module, and the host used to wait for the module and answer 500 when the wait ran out.
The wait is an op now, the way an accept in real Deno is an op on a real socket, and the call arriving is what ends it.

`oak-server` answers upstream's own 405 with upstream's own empty body, which makes it the twenty first name the two servers answer byte for byte.
`connect-supabase` loads, dispatches through oak and gets as far as its session store, which asked `crypto.subtle` for an AES-CBC key and was told there is only HMAC here.

## What the cipher moved

`crypto.subtle` has AES now, in CBC and in GCM, at all three key lengths, with `generateKey` and `exportKey` for the keys and `importKey` reading raw as it did before.
That moved one name and it is the one that asked: `connect-supabase` builds its cookie store and answers upstream's own 405 with upstream's own empty body, which makes it the twenty second name the two servers answer byte for byte.

## What the package file moved

`import.meta.resolve` of a package answers with the module the registry served rather than with the range that was asked for, and `Deno.readFile` takes an http url and reads it through the cache the modules are already fetched into.
Between them a package can read a file of its own, which upstream does by unpacking a tarball into a directory and this does by asking the registry for the file beside the module.

That moved one name and it is the one that asked.
`image-manipulation` reads fourteen megabytes of wasm out of `@imagemagick/magick-wasm`, initialises it, and answers the same 401 upstream answers with the same bytes, which makes it the twenty third name the two servers answer byte for byte.
It needed one more thing on the way: emscripten reads its own heap with `new TextDecoder('utf-16le')`, and this had utf-8 and nothing else.

Six names are left that upstream serves and this does not, and five of the six are the registry rather than the runtime.

One thing worth reading the whole way is what a signal does to the connection, because the two servers differ and only the far end can tell.
The same probe against a slow server that reports what it saw came back with a broken pipe from upstream and with an answer nobody read from zou: upstream tears the socket down and zou ends the waiting.

## What the socket moved

`Deno.connect`, `Deno.connectTls` and `Deno.startTls` are there now, so a function can hold a tcp connection of its own rather than only speak http through `fetch`.
That moved one name and it is the one that asked.

`postgres-on-the-edge` imports a postgres driver off jsr, which reads `SUPABASE_DB_URL`, opens a socket to the engine on the port the project's config names, authenticates, runs a select and is told by postgres that the table is not there.
The reference is told the same sentence, and the two bodies are the same bytes, which makes it the twenty fourth name the two servers answer identically.
It is worth being precise about what that measures: the driver is a real client speaking the wire protocol to zou's own engine, so the row is as much about the database as it is about the runtime.

Three names are left that upstream serves and this does not, and all three of them are the registry rather than the runtime.

One row in that run was read twice before it was written down.
`oak-server` came back 546 on the first pass, which is the host saying a function spent more than the two seconds of cpu it is allowed, and what it was spending it on was the first load of a module graph that size on a cold cache.
Warm it answers the 405 that is recorded, three times out of three, so the recording keeps the 405 and this paragraph keeps the 546.

## Reading the difference

The three zou answers ahead of the reference are all the same shape, which is that upstream's module graph is built ahead of time and refuses a graph it cannot complete: `kysely-postgres` on a bare specifier, `openai-image-generation` and `opengraph` on a `.d.ts` that is not there.
zou loads a module when something asks for it, so a type only file nobody imports at runtime is never fetched.

The three the reference runs and zou does not are none of them the runtime, and all three are somebody else's: one is esm.sh answering 500 for `@slack/web-api` whichever build is asked for, one is drizzle's browser build missing an export, and one is the mcp sdk asking the registry's build of `zod/v4` for `custom`, which that build's export list does not carry: it is two names, `z` and `default`, because the package's own `export *` became property copying onto an object the build never exports.

There is one more thing in the file that is not in the file, and it belongs here because it cost the most to find.
esm.sh serves different code for different `User-Agent` headers.
Asking as Deno gets a build that expects node built ins, and asking as a browser gets one that does not.
zou asks as a browser, deliberately, and the corpus is why: on the build that was measured at the time, asking as Deno took it from 28 running to 21.

## What the node built ins moved, and what the user agent did

The built ins arrived on 2026-08-22: nineteen `node:` modules carried in the binary, `buffer`, `crypto`, `events`, `fs`, `path`, `process`, `stream`, `util` and the rest of them.
The corpus was asked three times that afternoon on one machine, back to back, each with its own cold module cache, so the three columns are the same network and the same day and differ only in the server.

The first is the server as it shipped, asking the registry as `zou-edge-runtime`.
The second is the same server with the built ins in it, asking the same way.
The third is the same server again, asking as `Deno/2.1.4 (variant; zou/0.0.1)`.

The first two are the same run.
Not close to the same: every status, every name and every sentence in the log is identical, and `compare.mjs` against the recording says nothing moved for either.
32 ran, 8 did not, the same 8.
That is worth writing down plainly, because it is the opposite of what adding the built ins was expected to do: on the browser build the registry stubs node out itself, so nothing in this corpus was waiting for them.

The third ran 25.
Seven names the browser build gets to their own first decision, the Deno build does not:

```
elevenlabs-speech-to-text    node:child_process
elevenlabs-text-to-speech    node:child_process
puppeteer                    node:child_process
send-email-smtp              node:child_process
sentry                       node:diagnostics_channel
sentryfied                   node:diagnostics_channel
auth-hook-react-email-resend node:module
```

Four of the seven want to start a process.
That is not a built in nobody has written yet, it is a thing a function here is never going to do, so the answer for those four is not more javascript in the binary: it is a `child_process` that refuses the way the registry's stub refuses, at the call rather than at the import.
`diagnostics_channel` and `module` are ordinary work and would move three of the seven.

Two more names change their reason without changing their count, and both are the same one: `og-image-with-storage-cdn` and `tweet-to-image` ask `@vercel/og` for a font, the Deno build reads it with `fileURLToPath` on the url the module came from, and that is an `https:` url here rather than a file in an unpacked tarball.
Upstream unpacks a tarball, so there it is a path.
On the browser build both of those are esm.sh answering 500, which is the same two names not running for somebody else's reason.

So the server still asks as itself, and the flip waits on the refusal rather than on the count.

One thing that run found that has nothing to do with the user agent: a function that streams wasm can take the whole server down.
`wasm streaming callback invoked before the JS handler was set` is a panic inside `deno_core`, and a panic in the isolate thread aborts the process, so every function asked after it answered nothing at all.
It is [issue #592](https://github.com/tamnd/zou/issues/592).

## What the registry fallback moved

esm.sh answers 500 for `@vercel/og` asked as a browser, because that build hands esbuild a `.wasm` and esbuild has no loader for one.
Asked as Deno the same package is a 200.
So a 5xx from the registry is now a second ask with the runtime's own user agent, which is the one case where asking as Deno is the better build and the corpus does not have to be traded away to get it.
Two more pieces went with it: `fileURLToPath` of an `http` or `https` url answers with the url rather than throwing, because a package here is a url and not an unpacked tarball, and a synchronous read while a module is still loading is allowed to fetch, because that is when a wasm library reads its own wasm.

That moved `og-image-with-storage-cdn` and `tweet-to-image` from 500 to 401, which is the reference's status with the reference's bytes: `{"message":"Invalid credentials","code":"INVALID_CREDENTIALS"}`.
Both were read more than once, and both came back 546 on the very first cold ask, which is the cpu limit against a cold module graph again, then 401 three times out of three warm.
zou runs 34 of the 40 now, the same count as the reference, and the two agree on 31.

`@slack/web-api` does not move, because esm.sh answers 500 for it whichever build is asked for.
That is the registry failing to build a package rather than a build this runtime cannot use, and there is nothing on this side to fix.
