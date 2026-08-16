// The pattern the documentation puts in every example.
import { corsHeaders } from "../_shared/cors.ts";

Deno.serve((req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  return new Response("answered", {
    headers: { ...corsHeaders, "content-type": "text/plain" },
  });
});
