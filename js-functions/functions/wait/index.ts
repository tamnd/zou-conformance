// Work that outlives the answer. The caller is not made to wait for it,
// which is the only thing about it a caller can see.
Deno.serve(() => {
  EdgeRuntime.waitUntil(new Promise((done) => setTimeout(done, 1500)));
  return new Response("answered");
});
