// Private channels, asked through the client that subscribes to them.
//
// A private channel is the one part of realtime whose answer comes out
// of the project's own database: the room is allowed or refused by row
// level security policies on realtime.messages, written in sql, reading
// realtime.topic() for the room and auth.uid() for the person. The
// policies this file is asked against are in setup.sql next to it, and
// they are applied to both targets unedited, which is what makes a
// disagreement here a disagreement about the server.
//
// The questions are ours. supabase-js ships an integration suite and it
// has no private channel in it, so there is nothing to copy, and these
// are written the way the Supabase documentation writes one: a token on
// the client, `private: true` in the channel config, and policies that
// name nothing about realtime.
//
// One question is deliberately not asked. A push the write policies
// refuse is dropped by Supabase Realtime and answered with an error by
// zou, and both of those look the same to a listener, so this file asks
// only what both agree on, that nothing arrives. The difference is
// written down in zou's docs rather than asserted here, because a
// conformance suite that asserts a divergence is a suite that has to be
// edited to record a decision instead of a fact.

import { createHmac } from 'node:crypto'
import { createClient, RealtimeChannel, SupabaseClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.ZOU_URL ?? 'http://127.0.0.1:54321'
const ANON_KEY =
  process.env.ZOU_ANON_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0'
// Both targets are handed the same secret, which is the one a local
// supabase project is born with.
const JWT_SECRET =
  process.env.ZOU_JWT_SECRET ?? 'super-secret-jwt-token-with-at-least-32-characters-long'

// The person setup.sql put in the rooms.
const PERSON = '6f8a1d20-2f0a-4a2e-9a1d-0a8f1c2b3d4e'
// A room they may read and send to, one they may only read, and one
// that is not theirs at all.
const LOBBY = 'lobby'
const LISTEN = 'listen'
const VAULT = 'vault'

let wsTransport: any = undefined
if (typeof WebSocket === 'undefined' && typeof process !== 'undefined' && process.versions?.node) {
  try {
    wsTransport = (await import('ws')).default
  } catch {
    console.warn('no WebSocket and no ws package, the realtime tests will not connect')
  }
}

function b64url(value: string): string {
  return Buffer.from(value).toString('base64url')
}

/// A signed in person, minted here rather than got from GoTrue, because
/// what a policy reads is the claims and nothing else. The subject is a
/// uuid because auth.uid() casts it to one.
function token(sub: string): string {
  const now = Math.floor(Date.now() / 1000)
  const head = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
  const body = b64url(JSON.stringify({ role: 'authenticated', sub, iat: now, exp: now + 3600 }))
  const signature = createHmac('sha256', JWT_SECRET).update(`${head}.${body}`).digest('base64url')
  return `${head}.${body}.${signature}`
}

const clients: SupabaseClient[] = []

/// A client signed in as `sub`, or as nobody but the project key when
/// there is no subject.
///
/// The token goes in through `realtime.setAuth`, which is what an
/// application does when its session changes and what the client itself
/// does on a sign in. A websocket cannot carry a header, so this is the
/// token that ends up in the join payload.
async function client(sub?: string): Promise<SupabaseClient> {
  const made = createClient(SUPABASE_URL, ANON_KEY, {
    realtime: { heartbeatIntervalMs: 1000, ...(wsTransport && { transport: wsTransport }) },
  })
  clients.push(made)
  if (sub) await made.realtime.setAuth(token(sub))
  return made
}

afterEach(async () => {
  await Promise.all(clients.splice(0).map((c) => c.removeAllChannels()))
})

/// Subscribe and hand back what the client was told, rather than
/// throwing, because a refusal is the answer half of these want.
async function status(channel: RealtimeChannel): Promise<string> {
  return await new Promise<string>((resolve) => {
    const timeout = setTimeout(() => resolve('TIMED_OUT'), 10000)
    channel.subscribe((state) => {
      if (state === 'SUBSCRIBED' || state === 'CHANNEL_ERROR' || state === 'TIMED_OUT') {
        clearTimeout(timeout)
        resolve(state)
      }
    })
  })
}

async function until(what: string, ready: () => boolean): Promise<void> {
  for (let attempt = 0; attempt < 100; attempt++) {
    if (ready()) return
    await new Promise((resolve) => setTimeout(resolve, 50))
  }
  throw new Error(`timed out waiting for ${what}`)
}

/// Somebody in a private room, and the list they are hearing.
async function listening(room: string, event: string): Promise<any[]> {
  const heard: any[] = []
  const channel = (await client(PERSON)).channel(room, { config: { private: true } })
  channel.on('broadcast', { event }, (payload) => heard.push(payload))
  expect(await status(channel)).toBe('SUBSCRIBED')
  return heard
}

/// The http endpoint by hand, as the person rather than as the key,
/// which is the case the policies are about.
async function posted(path: string, body: unknown, sub = PERSON) {
  return await fetch(`${SUPABASE_URL}/realtime/v1/api/broadcast${path}`, {
    method: 'POST',
    headers: {
      apikey: ANON_KEY,
      Authorization: `Bearer ${token(sub)}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })
}

describe('private channels', () => {
  test('a room the read policy allows is joined', async () => {
    const channel = (await client(PERSON)).channel(LOBBY, { config: { private: true } })
    expect(await status(channel)).toBe('SUBSCRIBED')
  })

  test('a room no policy names is refused rather than joined and left silent', async () => {
    const channel = (await client(PERSON)).channel(VAULT, { config: { private: true } })
    expect(await status(channel)).toBe('CHANNEL_ERROR')
  })

  test('a project key with nobody behind it is refused a room written for signed in people', async () => {
    const channel = (await client()).channel(LOBBY, { config: { private: true } })
    expect(await status(channel)).toBe('CHANNEL_ERROR')
  })

  test('a room named after the person is theirs, which is auth.uid() in a policy', async () => {
    const mine = (await client(PERSON)).channel(PERSON, { config: { private: true } })
    expect(await status(mine)).toBe('SUBSCRIBED')

    const somebody_else = (await client('11111111-2222-3333-4444-555555555555')).channel(PERSON, {
      config: { private: true },
    })
    expect(await status(somebody_else)).toBe('CHANNEL_ERROR')
  })

  test('a broadcast between two members of a private room arrives', async () => {
    const heard = await listening(LOBBY, 'cursor')

    const sender = (await client(PERSON)).channel(LOBBY, { config: { private: true } })
    expect(await status(sender)).toBe('SUBSCRIBED')
    expect(await sender.send({ type: 'broadcast', event: 'cursor', payload: { x: 12 } })).toBe('ok')

    await until('the broadcast', () => heard.length > 0)
    expect(heard[0].payload).toEqual({ x: 12 })
  })

  test('a send to a room the write policy refuses reaches nobody', async () => {
    const heard = await listening(LISTEN, 'refused')

    const sender = (await client(PERSON)).channel(LISTEN, { config: { private: true } })
    expect(await status(sender)).toBe('SUBSCRIBED')
    await sender.send({ type: 'broadcast', event: 'refused', payload: { x: 1 } })

    await new Promise((resolve) => setTimeout(resolve, 1000))
    expect(heard).toHaveLength(0)
  })

  test('a post to a room the write policy allows is accepted and delivered', async () => {
    const heard = await listening(LOBBY, 'posted')

    const answer = await posted(`/${LOBBY}/events/posted?private=true`, { x: 1 })
    expect(answer.status).toBe(202)

    await until('the posted broadcast', () => heard.length > 0)
    expect(heard[0].payload).toEqual({ x: 1 })
  })

  test('a post to a room the write policy refuses is unauthorized', async () => {
    const heard = await listening(LISTEN, 'posted')

    const answer = await posted(`/${LISTEN}/events/posted?private=true`, { x: 1 })
    expect(answer.status).toBe(403)
    expect(await answer.json()).toEqual({ message: 'Unauthorized' })

    await new Promise((resolve) => setTimeout(resolve, 1000))
    expect(heard).toHaveLength(0)
  })

  test('a batch sends the rooms the policies allow and says nothing about the rest', async () => {
    const allowed = await listening(LOBBY, 'batched')
    const refused = await listening(LISTEN, 'batched')

    const answer = await posted('', {
      messages: [
        { topic: LOBBY, event: 'batched', payload: { x: 1 }, private: true },
        { topic: LISTEN, event: 'batched', payload: { x: 2 }, private: true },
      ],
    })
    // Taken, with nothing in the answer about the half that was
    // dropped. A client reading the status alone cannot tell.
    expect(answer.status).toBe(202)

    await until('the half the policies allow', () => allowed.length > 0)
    expect(allowed[0].payload).toEqual({ x: 1 })
    await new Promise((resolve) => setTimeout(resolve, 1000))
    expect(refused).toHaveLength(0)
  })
})
