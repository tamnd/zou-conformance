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
Eighteen of the thirty zou ran stopped at a 401 in front of the handler, and six more got as far as a library saying it has no api key.
The claim being made is that the runtime got the code to its own first decision, and not that the example works.

## Running it

```
examples/corpus.sh /tmp/exproj
```

Lays the project out at `/tmp/exproj/supabase` from a checkout of `supabase/supabase` at the commit in `measured.json`.
The project is not vendored here: it is somebody else's code, it moves, and pinning the commit is the part that matters.

Then serve it with one server and ask:

```
zou functions serve --project /tmp/exproj/supabase --port 54341
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

40 functions asked, the reference on 2026-08-17 and zou on 2026-08-19.
zou ran 30 of them, the reference ran 34, and they agree on 27.
Twenty two of the forty answer the same status with the same bytes on both servers.

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

Seven names are left that upstream serves and this does not, and five of the seven are the registry rather than the runtime.

One thing worth reading the whole way is what a signal does to the connection, because the two servers differ and only the far end can tell.
The same probe against a slow server that reports what it saw came back with a broken pipe from upstream and with an answer nobody read from zou: upstream tears the socket down and zou ends the waiting.

## Reading the difference

The three zou answers ahead of the reference are all the same shape, which is that upstream's module graph is built ahead of time and refuses a graph it cannot complete: `kysely-postgres` on a bare specifier, `openai-image-generation` and `opengraph` on a `.d.ts` that is not there.
zou loads a module when something asks for it, so a type only file nobody imports at runtime is never fetched.

The seven the reference runs and zou does not are seven different things rather than one, which is why they are follow ups rather than a bug.
One wants `Deno.connect` and one wants `Deno.readFile` of an https url, and those two are the runtime.
The other five are somebody else's: three are esm.sh answering 500 for `@vercel/og` and `@slack/web-api`, one is drizzle's browser build missing an export, and one is the mcp sdk failing inside the registry's build of itself.

There is one more thing in the file that is not in the file, and it belongs here because it cost the most to find.
esm.sh serves different code for different `User-Agent` headers.
Asking as Deno gets a build that expects node built ins, and asking as a browser gets one that does not.
zou asks as a browser, deliberately, and the corpus is why: on the build that was measured at the time, asking as Deno took it from 28 running to 21.
