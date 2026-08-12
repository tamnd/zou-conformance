// Broadcast without a socket, asked through the client that sends it.
//
// A channel can be sent to over http as well as over a websocket, which
// is how anything that is not a browser talks to a room: a trigger, a
// worker, a cron job, or a client whose socket is not up yet. The
// client has two ways of doing it and they are different urls, so both
// are asked here.
//
// The questions are ours, the same as the presence file next to this
// one, and the thing that makes them a statement about Supabase rather
// than about zou is that the same file runs against a real stack.

import { createClient, RealtimeChannel, SupabaseClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.ZOU_URL ?? 'http://127.0.0.1:54321'
const ANON_KEY =
  process.env.ZOU_ANON_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0'

let wsTransport: any = undefined
if (typeof WebSocket === 'undefined' && typeof process !== 'undefined' && process.versions?.node) {
  try {
    wsTransport = (await import('ws')).default
  } catch {
    console.warn('no WebSocket and no ws package, the realtime tests will not connect')
  }
}

const clients: SupabaseClient[] = []

function client(): SupabaseClient {
  const made = createClient(SUPABASE_URL, ANON_KEY, {
    realtime: { heartbeatIntervalMs: 1000, ...(wsTransport && { transport: wsTransport }) },
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
  for (let attempt = 0; attempt < 100; attempt++) {
    if (ready()) return
    await new Promise((resolve) => setTimeout(resolve, 50))
  }
  throw new Error(`timed out waiting for ${what}`)
}

function topic(): string {
  return `room-${crypto.randomUUID()}`
}

/// A room with somebody in it, and the list they are hearing.
async function listening(room: string, event: string): Promise<any[]> {
  const heard: any[] = []
  const channel = client().channel(room)
  channel.on('broadcast', { event }, (payload) => heard.push(payload))
  await subscribed(channel)
  return heard
}

/// The endpoint by hand, which is the shape both of the client's own
/// ways of sending end up posting.
async function posted(path: string, body: BodyInit, contentType = 'application/json') {
  return await fetch(`${SUPABASE_URL}/realtime/v1/api/broadcast${path}`, {
    method: 'POST',
    headers: { apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}`, 'Content-Type': contentType },
    body,
  })
}

/// Whether this is a server old enough not to have the single message
/// url, which the client says in as many words. Reported rather than
/// swallowed: a skipped question should be visible in the log.
function tooOldForHttpSend(error: unknown): boolean {
  const said = error instanceof Error ? error.message : String(error)
  if (said.includes('v2.97.0')) {
    console.warn(`httpSend is not on this server, the question was not asked: ${said}`)
    return true
  }
  return false
}

describe('broadcast over http', () => {
  test('a batch posted to the endpoint reaches the room', async () => {
    const room = topic()
    const heard = await listening(room, 'cursor')

    const answer = await posted(
      '',
      JSON.stringify({
        messages: [{ topic: room, event: 'cursor', payload: { x: 12, y: 40 }, private: false }],
      })
    )
    // Accepted, and nothing about whether anybody was there to hear
    // it, because a broadcast is not stored and there is nothing else
    // true to say.
    expect(answer.status).toBe(202)

    await until('the posted broadcast', () => heard.length > 0)
    expect(heard[0].event).toBe('cursor')
    expect(heard[0].payload).toEqual({ x: 12, y: 40 })
  })

  test('several messages in one post are several messages in the room', async () => {
    const room = topic()
    const heard = await listening(room, 'tick')

    const answer = await posted(
      '',
      JSON.stringify({
        messages: [1, 2, 3].map((n) => ({ topic: room, event: 'tick', payload: { n } })),
      })
    )
    expect(answer.status).toBe(202)

    await until('all three', () => heard.length === 3)
    expect(heard.map((m) => m.payload.n)).toEqual([1, 2, 3])
  })

  test('a message with no event on it is refused', async () => {
    const room = topic()
    const heard = await listening(room, 'cursor')

    const answer = await posted(
      '',
      JSON.stringify({ messages: [{ topic: room, payload: { x: 1 } }] })
    )
    expect(answer.status).toBe(422)

    await new Promise((resolve) => setTimeout(resolve, 500))
    expect(heard).toHaveLength(0)
  })

  test('send() on a channel with no socket goes over http', async () => {
    const room = topic()
    const heard = await listening(room, 'cursor')

    // Never subscribed, so there is nothing to push down and the
    // client posts instead. This is what an application that only ever
    // sends gets without asking for it.
    const sender = client().channel(room)
    const sent = await sender.send({
      type: 'broadcast',
      event: 'cursor',
      payload: { x: 1, y: 2 },
    })
    expect(sent).toBe('ok')

    await until('the broadcast the client posted', () => heard.length > 0)
    expect(heard[0].payload).toEqual({ x: 1, y: 2 })
  })

  test('httpSend puts the topic and the event in the url', async () => {
    const room = topic()
    const heard = await listening(room, 'cursor')

    const sender = client().channel(room)
    try {
      const answer = await sender.httpSend('cursor', { x: 3, y: 4 })
      expect(answer.success).toBe(true)
    } catch (error) {
      if (tooOldForHttpSend(error)) return
      throw error
    }

    await until('the broadcast httpSend posted', () => heard.length > 0)
    expect(heard[0].event).toBe('cursor')
    expect(heard[0].payload).toEqual({ x: 3, y: 4 })
  })

  test('a payload of bytes arrives as bytes rather than as text', async () => {
    const room = topic()
    const heard = await listening(room, 'frame')

    const sender = client().channel(room)
    try {
      const answer = await sender.httpSend('frame', new Uint8Array([0, 1, 2, 250]))
      expect(answer.success).toBe(true)
    } catch (error) {
      if (tooOldForHttpSend(error)) return
      throw error
    }

    // That it arrives at all, and not as a string. What exactly a
    // server wraps an octet-stream body in on the way through is not
    // asserted here, because the two servers have not been shown to
    // agree on it, see the README next to this file.
    await until('the bytes', () => heard.length > 0)
    expect(typeof heard[0].payload).not.toBe('string')
  })

  test('a posted message reaches one room and not the one next to it', async () => {
    const room = topic()
    const elsewhere = topic()
    const heard = await listening(room, 'cursor')
    const other = await listening(elsewhere, 'cursor')

    expect((await posted('', JSON.stringify({ messages: [{ topic: room, event: 'cursor', payload: {} }] }))).status).toBe(202)

    await until('the broadcast', () => heard.length > 0)
    await new Promise((resolve) => setTimeout(resolve, 500))
    expect(other).toHaveLength(0)
  })

  test('a post with no key at all is refused', async () => {
    const room = topic()
    const answer = await fetch(`${SUPABASE_URL}/realtime/v1/api/broadcast`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: [{ topic: room, event: 'cursor', payload: {} }] }),
    })
    expect(answer.ok).toBe(false)
    expect(answer.status).toBeGreaterThanOrEqual(400)
    expect(answer.status).toBeLessThan(500)
  })
})
