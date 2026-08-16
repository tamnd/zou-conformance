// A function the config file named and the listing never saw: there is
// no functions/entry-elsewhere, only this file two directories down
// and an entrypoint pointing at it. The Supabase examples project's
// simple-mcp-server is written this way.
import { how } from "./how.ts";

Deno.serve((req: Request) => {
  const url = new URL(req.url);
  return Response.json({ said: how, method: req.method, pathname: url.pathname });
});
