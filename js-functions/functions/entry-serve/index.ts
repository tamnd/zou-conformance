// The entry point the documentation writes.
Deno.serve((req: Request) => {
  const url = new URL(req.url);
  return Response.json({
    said: "deno.serve",
    method: req.method,
    pathname: url.pathname,
    search: url.search,
  });
});
