// A handler that fails the way a handler fails: after it started.
Deno.serve(() => {
  throw new Error("the database was not there");
});
