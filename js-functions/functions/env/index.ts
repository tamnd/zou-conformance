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
  ];
  const set: Record<string, boolean> = {};
  for (const name of named) {
    set[name] = (Deno.env.get(name) ?? "") !== "";
  }
  return Response.json({
    set,
    execution: Deno.env.get("SB_EXECUTION_ID") ?? null,
    edgeRuntime: typeof EdgeRuntime,
    waitUntil: typeof EdgeRuntime === "undefined" ? "undefined" : typeof EdgeRuntime.waitUntil,
  });
});
