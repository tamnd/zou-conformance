// Which of the variables a project is promised are set, and never what
// they are set to. A suite that printed a service role key would be a
// suite that put one in a log.
Deno.serve(() => {
  const named = [
    "SUPABASE_URL",
    "SUPABASE_ANON_KEY",
    "SUPABASE_SERVICE_ROLE_KEY",
    "SUPABASE_DB_URL",
    "SB_EXECUTION_ID",
    "SUPABASE_PUBLISHABLE_KEYS",
    "SUPABASE_SECRET_KEYS",
    "SUPABASE_JWKS",
  ];
  const set: Record<string, boolean> = {};
  for (const name of named) {
    set[name] = (Deno.env.get(name) ?? "") !== "";
  }
  // A library reads one key out of the map by name rather than reading
  // the map, so what is asked about the two maps is whether the name it
  // looks for is in there, and never what is under it.
  const has_default = (name: string): boolean => {
    try {
      const keys = JSON.parse(Deno.env.get(name) ?? "null");
      return typeof keys?.default === "string" && keys.default !== "";
    } catch {
      return false;
    }
  };
  return Response.json({
    set,
    defaults: {
      SUPABASE_PUBLISHABLE_KEYS: has_default("SUPABASE_PUBLISHABLE_KEYS"),
      SUPABASE_SECRET_KEYS: has_default("SUPABASE_SECRET_KEYS"),
    },
    execution: Deno.env.get("SB_EXECUTION_ID") ?? null,
    edgeRuntime: typeof EdgeRuntime,
    waitUntil: typeof EdgeRuntime === "undefined" ? "undefined" : typeof EdgeRuntime.waitUntil,
  });
});
