// A body made as it is sent. The gaps are what tells a caller reading
// it from a caller who was handed the whole thing at the end.
Deno.serve(() => {
  const encoder = new TextEncoder();
  let sent = 0;
  const body = new ReadableStream({
    async pull(controller) {
      if (sent === 5) {
        controller.close();
        return;
      }
      sent += 1;
      controller.enqueue(encoder.encode(`chunk ${sent}\n`));
      await new Promise((done) => setTimeout(done, 120));
    },
  });
  return new Response(body, { headers: { "content-type": "text/plain" } });
});
