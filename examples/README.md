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
Seventeen of the twenty eight zou ran stopped at a 401 in front of the handler, and five more got as far as a library saying it has no api key.
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

39 functions asked, on 2026-08-16.
zou ran 28 of them, the reference ran 34, and they agree on 25.

Where the 39 comes from, since a number about a corpus is mostly a number about who was counted.
There are 42 directories under `functions/` and 39 of them have an `index.ts`: `_shared`, `mcp` and `unit-testing` have no entrypoint of their own and are not functions.
`config.toml` adds a fortieth name that has no directory at all, `simple-mcp-server`, whose entrypoint it points two levels down at `functions/mcp/simple-mcp-server/index.ts`.
That makes 40 names zou was asked, and 39 that both servers were asked: `wasm-modules` is left out because its build artifact `add-wasm/pkg/add_wasm.js` is not in the checkout, so the reference has nothing to serve and the comparison would be about a missing file.

Five failures are shared and byte for byte identical on both servers, out of the same libraries:

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

## Reading the difference

The three zou answers ahead of the reference are all the same shape, which is that upstream's module graph is built ahead of time and refuses a graph it cannot complete: `kysely-postgres` on a bare specifier, `openai-image-generation` and `opengraph` on a `.d.ts` that is not there.
zou loads a module when something asks for it, so a type only file nobody imports at runtime is never fetched.

The nine the reference runs and zou does not are nine different things rather than one, which is why they are follow ups rather than a bug.
Two are top level await that never settles because the thing it awaits is a server that is already listening.
One wants `Deno.connect`, one wants `Deno.readFile` of an https url, one imports a module served with no content type, three are esm.sh answering 500 for `@vercel/og` and `@slack/web-api`, one is drizzle's browser build missing an export, and one is the mcp sdk failing inside the registry's build of itself.

There is one more thing in the file that is not in the file, and it belongs here because it cost the most to find.
esm.sh serves different code for different `User-Agent` headers.
Asking as Deno gets a build that expects node built ins, and asking as a browser gets one that does not.
zou asks as a browser, deliberately, and the corpus is why: asking as Deno took it from 28 running to 21.
