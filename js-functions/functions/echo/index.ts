// What arrived, said back.
Deno.serve(async (req: Request) => {
  const url = new URL(req.url);
  return Response.json({
    method: req.method,
    pathname: url.pathname,
    search: url.search,
    contentType: req.headers.get("content-type"),
    sent: req.headers.get("x-sent"),
    body: await req.text(),
  });
});
