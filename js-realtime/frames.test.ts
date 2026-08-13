// The frames themselves, for broadcast and for presence.
//
// The two files next to this one read what the client handed the
// application, which is the fold of the frames rather than the frames.
// A server can get the fold right and still send something upstream
// never sends, and the client would not notice: it renames what it
// knows, ignores what it does not, and hands over an object.
//
// So this records what came off the socket, with the parts that cannot
// repeat replaced, and compares it with the same recording taken from a
// real `supabase start`. `frames-broadcast.json` and
// `frames-presence.json` next to this file are those recordings, and
// running this against the reference in check mode is what keeps them a
// statement about upstream rather than files that were true once.
//
// One socket is recorded, never two. Frames from two sockets interleave
// in whatever order two servers and one runner felt like that second,
// and a golden with a race in it is a golden nobody will trust in six
// months. Where a second person is needed, they arrive on a client with
// no tap on it, and every step is awaited before the next one starts,
// so the recorded order is the server's order rather than the runner's.

import { readFileSync, writeFileSync } from 'node:fs'
import { createClient, RealtimeChannel, SupabaseClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.ZOU_URL ?? 'http://127.0.0.1:54321'
const ANON_KEY =
  process.env.ZOU_ANON_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0'

// Writing the recording rather than checking against it, which is what
// a run against the reference does. The file it writes is the answer,
// so a run in this mode asserts nothing.
const RECORDING = process.env.ZOU_RECORD === '1'

let wsTransport: any = undefined
if (typeof WebSocket === 'undefined' && typeof process !== 'undefined' && process.versions?.node) {
  try {
    wsTransport = (await import('ws')).default
  } catch {
    console.warn('no WebSocket and no ws package, the realtime tests will not connect')
  }
}

const clients: SupabaseClient[] = []
// Every frame the tapped client was sent, in order, as it came off the
// wire. A frame is a string or an ArrayBuffer, because both are on this
// socket and taking only the strings would quietly drop the broadcasts.
let frames: unknown[] = []

/// The transport the client is given, which is the real one with a tap
/// on it. A frame is kept before the client has decoded it, so what is
/// compared is what the server sent rather than what the client made of
/// it.
function recorder(): any {
  const base = wsTransport ?? (globalThis as any).WebSocket
  if (!base) return undefined
  return class Tapped extends base {
    constructor(...args: any[]) {
      super(...args)
      this.addEventListener('message', (event: any) => frames.push(event.data))
    }
  }
}

/// A client with the tap on it, or one without, which is how a second
/// person arrives without their socket landing in the recording.
function client(tapped: boolean): SupabaseClient {
  const transport = tapped ? recorder() : wsTransport
  const made = createClient(SUPABASE_URL, ANON_KEY, {
    // A quarter of a minute, so no heartbeat falls inside a recording
    // that takes a second to make. The heartbeats are dropped below
    // anyway, and not sending them at all keeps the socket's own
    // traffic out of the way of what is being asked.
    realtime: { heartbeatIntervalMs: 25000, ...(transport && { transport }) },
  })
  clients.push(made)
  return made
}

afterEach(async () => {
  await Promise.all(clients.splice(0).map((c) => c.removeAllChannels()))
})

async function subscribed(channel: RealtimeChannel): Promise<RealtimeChannel> {
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('subscribe timed out')), 10000)
    channel.subscribe((status, error) => {
      if (status === 'SUBSCRIBED') {
        clearTimeout(timeout)
        resolve()
      }
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        clearTimeout(timeout)
        reject(error ?? new Error(status))
      }
    })
  })
  return channel
}

async function until(what: string, ready: () => boolean): Promise<void> {
  for (let attempt = 0; attempt < 200; attempt++) {
    if (ready()) return
    await new Promise((resolve) => setTimeout(resolve, 50))
  }
  throw new Error(`timed out waiting for ${what}`)
}

/// A frame as it can be compared with the same frame sent by another
/// server on another day.
///
/// Two things in one are true of a run rather than of a server. The
/// refs are a counter this client kept, and the presence refs are
/// whatever the server minted to tell one meta from another. Both
/// become `<ref>`. Everything else is the server's answer and is
/// compared as it arrived, every frame, every field and every value,
/// with the order of the frames being part of it. The order of the keys
/// inside one is not: json objects are compared as objects, the same
/// way every client that reads them does.
function normalise(raw: unknown[]): unknown[] {
  const frames: unknown[] = []
  for (const one of raw) {
    if (typeof one !== 'string') {
      frames.push(binary(one as ArrayBuffer))
      continue
    }
    const [join_ref, ref, topic, event, payload] = JSON.parse(one)
    // The heartbeat is the client's own clock rather than an answer
    // about anything here.
    if (topic === 'phoenix') continue
    frames.push({
      frame: 'text',
      join_ref: join_ref === null ? null : '<ref>',
      ref: ref === null ? null : '<ref>',
      topic,
      event,
      payload: derefed(payload),
    })
  }
  return frames
}

/// A binary frame, taken apart the way the client takes it apart.
///
/// A broadcast is not json on this socket. The client encodes what it
/// sends as a length prefixed binary frame and the server answers in the
/// same encoding, so a recording that kept only the strings would say a
/// broadcast channel receives nothing. The layout is one byte of kind,
/// then the sizes of the topic, the event and the metadata, then how the
/// payload is encoded, then those four things end to end.
///
/// Kind 4 is a broadcast to a subscriber, and encoding 1 is a json
/// payload, which is what everything below sends. Anything else is
/// recorded as the bytes so a server that invents a kind is a diff
/// rather than a crash.
function binary(buffer: ArrayBuffer): unknown {
  const bytes = new Uint8Array(buffer)
  if (bytes[0] !== 4) return { frame: 'binary', kind: bytes[0], bytes: [...bytes] }
  const [kind, topicSize, eventSize, metaSize, encoding] = bytes
  const text = new TextDecoder()
  let at = 5
  const read = (size: number) => text.decode(bytes.slice(at, (at += size)))
  const topic = read(topicSize)
  const event = read(eventSize)
  const meta = read(metaSize)
  const rest = bytes.slice(at)
  return {
    frame: 'binary',
    kind,
    topic,
    event,
    meta: metaSize === 0 ? null : derefed(JSON.parse(meta)),
    encoding,
    payload: encoding === 1 ? derefed(JSON.parse(text.decode(rest))) : [...rest],
  }
}

/// Every `phx_ref` and `phx_ref_prev` anywhere in a payload, replaced
/// by the fact that there was one. They are how a client tells this
/// meta from the one before it, and no two runs can agree on them.
function derefed(value: any): any {
  if (Array.isArray(value)) return value.map(derefed)
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [key, one] of Object.entries(value)) {
      out[key] = key === 'phx_ref' || key === 'phx_ref_prev' ? '<ref>' : derefed(one)
    }
    return out
  }
  return value
}

/// Check the recording, or write it, which is the whole of what the two
/// tests below do with what they gathered.
function golden(name: string, note: string[], seen: unknown[]) {
  const file = new URL(`./${name}`, import.meta.url)
  if (RECORDING) {
    writeFileSync(
      file,
      JSON.stringify({ note, recorded_from: 'supabase start', frames: seen }, null, 2) + '\n'
    )
    console.warn(`recorded ${seen.length} frames into ${name}`)
    return
  }
  expect(seen).toEqual(JSON.parse(readFileSync(file, 'utf8')).frames)
}

describe('the frames', () => {
  // A broadcast with `self` and `ack` on it, which is the configuration
  // that makes a server say the most: the join is answered, the message
  // comes back to the socket that sent it, and the push is acknowledged.
  // Without `self` a sender hears nothing and there would be two frames
  // here to compare.
  //
  // The middle one is the binary frame, and the reason this file reads
  // more than the strings.
  test('a broadcast is the frames Supabase Realtime sends', async () => {
    frames = []
    const heard: any[] = []
    const channel = client(true).channel('golden-broadcast', {
      config: { broadcast: { self: true, ack: true } },
    })
    channel.on('broadcast', { event: 'cursor' }, (message) => heard.push(message))
    await subscribed(channel)

    // Awaited, so the ack is in the recording rather than racing the
    // end of the test.
    expect(await channel.send({ type: 'broadcast', event: 'cursor', payload: { x: 12, y: 40 } })).toBe(
      'ok'
    )
    await until('the broadcast to come back', () => heard.length > 0)

    golden('frames-broadcast.json', BROADCAST_NOTE, normalise(frames))
  })

  // Presence, from the empty room to the room with somebody else in it
  // and back. The second person is on a client with no tap, so what is
  // recorded is one socket's view: the state it was sent on joining,
  // the diff for its own track, the diff for the arrival, and the diff
  // for the leave.
  test('presence is the frames Supabase Realtime sends', async () => {
    frames = []
    const diffs: any[] = []
    const watching = client(true).channel('golden-presence', {
      config: { presence: { key: 'alice' } },
    })
    // The binding is what turns presence on for this channel: the
    // client puts `enabled` in the join for anybody with one.
    watching.on('presence', { event: 'sync' }, () => {})
    watching.on('presence', { event: 'join' }, (diff) => diffs.push(diff))
    watching.on('presence', { event: 'leave' }, (diff) => diffs.push(diff))
    await subscribed(watching)

    expect(await watching.track({ at: 'noon' })).toBe('ok')
    await until('the tracker to see itself', () => Object.keys(watching.presenceState()).length === 1)

    const arriving = client(false).channel('golden-presence', {
      config: { presence: { key: 'bob' } },
    })
    await subscribed(arriving)
    expect(await arriving.track({ at: 'later' })).toBe('ok')
    await until('the arrival', () => Object.keys(watching.presenceState()).length === 2)

    expect(await arriving.untrack()).toBe('ok')
    await until('the leaving', () => Object.keys(watching.presenceState()).length === 1)

    golden('frames-presence.json', PRESENCE_NOTE, normalise(frames))
  })
})

const BROADCAST_NOTE = [
  'The frames Supabase Realtime sent to a channel with self and ack on it, for one broadcast the channel sent itself.',
  'Written by frames.test.ts with ZOU_RECORD=1 against a real supabase start, and compared by the same file against zou.',
  'The refs cannot repeat, so a ref is replaced by the fact that there was one.',
  'A broadcast is a binary frame rather than json, and it is recorded taken apart into the fields the client reads out of it.',
]

const PRESENCE_NOTE = [
  'The frames Supabase Realtime sent to one socket in a presence channel: the state it joined to, its own track, somebody else arriving, and that person leaving.',
  'Written by frames.test.ts with ZOU_RECORD=1 against a real supabase start, and compared by the same file against zou.',
  'The refs and the presence refs cannot repeat, so both are replaced by the fact that there was one.',
]
