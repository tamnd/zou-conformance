// The function config.toml turns verify_jwt off for.
Deno.serve(() => new Response("no token needed"));
