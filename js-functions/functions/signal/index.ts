// Giving up on a call. A library that bounds a fetch does it with a
// signal, so what is asked here is the three ways a signal is made
// without a controller, the name and message a rejection carries, and
// whether a signal handed to a `Request` reaches the call the request
// becomes.
//
// The slow thing fetched is this project's own `stream` function, which
// takes five chunks a hundred and twenty milliseconds apart, so a fifty
// millisecond timeout lands while the call is still out rather than
// before it started or after it finished.
const named = (signal: AbortSignal): string | null =>
  signal.aborted ? `${signal.reason.name}: ${signal.reason.message}` : null;

Deno.serve(async () => {
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  const slow = `${url}/functions/v1/stream`;
  const headers = { Authorization: `Bearer ${key}`, apikey: key };

  // The body is read as well as the headers, and that is not tidiness.
  // Upstream hands the answer back when the headers arrive and zou
  // collects the body first, so a question that stopped at the headers
  // would be racing a stream that starts at once against a fifty
  // millisecond clock, and would answer whichever won on the day.
  // Reading the body makes both servers take the six hundred
  // milliseconds the five chunks take, which is what the signal is
  // being asked about.
  const read = async (asked: Request | string, signal?: AbortSignal): Promise<string> => {
    try {
      const res = typeof asked === "string"
        ? await fetch(asked, { headers, signal })
        : await fetch(asked);
      await res.arrayBuffer();
      return "answered";
    } catch (e) {
      return `${(e as Error).name}: ${(e as Error).message}`;
    }
  };

  const call = (signal: AbortSignal | undefined): Promise<string> => read(slow, signal);

  const statics = {
    abort: typeof AbortSignal.abort,
    timeout: typeof AbortSignal.timeout,
    any: typeof AbortSignal.any,
  };

  // A signal handed to a request is not the signal the request has, and
  // aborting the one aborts the other, through a clone and through a
  // copy as well.
  const giving_up = new AbortController();
  const built = new Request(slow, { signal: giving_up.signal });
  const copied = built.clone();
  const onward = new Request(built);
  const same = built.signal === giving_up.signal;
  const before = [named(built.signal), named(copied.signal), named(onward.signal)];
  giving_up.abort(new Error("the caller"));
  const after = [named(built.signal), named(copied.signal), named(onward.signal)];

  const cancelling = new AbortController();
  setTimeout(() => cancelling.abort(), 50);

  let refused = "";
  try {
    AbortSignal.timeout("soon" as unknown as number);
  } catch (e) {
    refused = (e as Error).name;
  }

  return Response.json({
    statics,
    reasons: {
      already: named(AbortSignal.abort()),
      reasoned: named(AbortSignal.abort(new Error("no time for that"))),
      either: named(AbortSignal.any([AbortSignal.abort(new Error("first")), new AbortController().signal])),
    },
    refused,
    request: { same, before, after },
    fetched: {
      gave_up: await call(cancelling.signal),
      ran_out: await call(AbortSignal.timeout(50)),
      already: await call(AbortSignal.abort()),
      bounded: await read(new Request(slow, { headers, signal: AbortSignal.timeout(50) })),
      fine: await call(undefined),
    },
  });
});
