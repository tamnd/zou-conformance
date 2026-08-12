# the realtime suite

Presence and http broadcast, asked through the client that implements them.

supabase-js ships an integration suite and this repository runs it unedited, but it has no presence in it. There is nothing to copy, so the questions here are ours, written the way the Supabase documentation writes a presence channel: a key in the channel config, `track` after SUBSCRIBED, and the state read back with `presenceState()`.

The assertions are read through the client rather than off a raw socket, because presence has a client side to it. The server sends the whole state once and diffs after that, and the client folds them into the object an application reads. A server whose diffs the fold cannot apply is a server whose own socket tests all pass and whose users watch a room slowly stop matching reality.

`broadcast.test.ts` is the other half of the file next to it: a room can be sent to over http as well as over a socket, which is how a trigger, a worker or a cron job talks to one. The client has two ways of doing it, `send()` on a channel whose socket is not up, which posts a batch, and `httpSend()`, which puts the topic and the event in the url, and both are asked here along with the endpoint by hand.

One question in it is deliberately loose. A payload posted as `application/octet-stream` is asserted to arrive and to arrive as something other than a string, and not to arrive in a particular shape, because the two servers have not been shown to agree on what a binary body is wrapped in on the way through. Tightening that is worth a run against a reference new enough to have the url, which is what the skip below is about.

`httpSend()` is newer than the batch endpoint, and a client talking to a server without it gets a 404 and a message naming the version. When that happens the two questions that need it are skipped with a warning in the log rather than passed quietly, so a run against an older stack says which questions it did not get to ask.

## What it caught on the day it was written

`config.presence.enabled` reads like it decides whether a channel has presence. It does not, and the client sets it for you: it is true if the channel has a `presence` binding on it, and false otherwise. What it gates is whether this client is *sent* presence, not whether it can be *seen*. A client that tracks with no binding is in everybody else's state and gets nothing back itself.

Half the tests here were written without a `presence` listener, read an empty state and failed, which is the client behaving exactly as documented and the suite asking the wrong thing. They now bind a listener where they read state, which is what an application does, and there is one test left over for the other half of the rule: a channel with no binding at all tracks, and the watcher sees it.

## Running it

Realtime touches no rows, so it needs no database. zou serves it from an example in the zou repository:

```
cd /path/to/zou
cargo run -p zou-server --example front_door &

cd /tmp/zou-conformance/js-realtime
npm ci
npm test
```

Against a real local stack instead, which is the reason to trust the questions:

```
supabase start
ZOU_URL=http://127.0.0.1:54321 ZOU_ANON_KEY=<the anon key> npm test
```

CI runs it both ways, the same as the tus suite next to it. A failure against the stack a person gets is this repository having written down something Supabase Realtime does not do, and should be read as the suite being wrong rather than the server.
