// What a function can reach. The answer is a list of typeofs rather
// than a list of assertions, so that the two servers can be compared
// name by name instead of at the first difference.
Deno.serve(async () => {
  const globals = [
    "fetch",
    "Request",
    "Response",
    "Headers",
    "URL",
    "URLSearchParams",
    "Blob",
    "File",
    "FormData",
    "crypto",
    "TextEncoder",
    "TextDecoder",
    "ReadableStream",
    "WebSocket",
    "Event",
    "MessageEvent",
    "CloseEvent",
    "ErrorEvent",
    "AbortController",
    "AbortSignal",
    "DOMException",
    "atob",
    "btoa",
    "setTimeout",
    "setInterval",
    "queueMicrotask",
    "console",
  ];
  const there: Record<string, string> = {};
  for (const name of globals) {
    there[name] = typeof (globalThis as Record<string, unknown>)[name];
  }
  const denos = ["serve", "env", "listen", "serveHttp", "readFile", "readTextFile", "errors", "build", "version"];
  const deno: Record<string, string> = {};
  for (const name of denos) {
    deno[name] = typeof (Deno as unknown as Record<string, unknown>)[name];
  }
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode("zou"));
  return Response.json({
    there,
    deno,
    uuid: crypto.randomUUID().length,
    digest: new Uint8Array(digest).length,
    encoded: Array.from(new TextEncoder().encode("hé")),
    base64: btoa("hello"),
  });
});
