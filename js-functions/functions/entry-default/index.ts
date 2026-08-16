// The entry point somebody arriving from another edge runtime writes.
export default {
  async fetch(req: Request) {
    const url = new URL(req.url);
    return Response.json({ said: "default export", method: req.method, pathname: url.pathname });
  },
};
