// The entry point every example written before Deno.serve existed uses.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

serve((req: Request) => {
  const url = new URL(req.url);
  return Response.json({ said: "std serve", method: req.method, pathname: url.pathname });
});
