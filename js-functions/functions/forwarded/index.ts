// What the handler is told about the request that reached the front
// door, and what it is told its own url is.
Deno.serve((req: Request) => {
  const named = [
    "x-forwarded-host",
    "x-forwarded-proto",
    "x-forwarded-port",
    "x-real-ip",
    "authorization",
    "x-client-info",
  ];
  const headers: Record<string, string | null> = {};
  for (const name of named) {
    headers[name] = req.headers.get(name);
  }
  const url = new URL(req.url);
  return Response.json({ headers, pathname: url.pathname, search: url.search });
});
