// Presence, asked through the client that implements it.
//
// supabase-js ships an integration suite and it has no presence in it,
// so there is nothing to copy here. The questions are ours, written the
// way the Supabase documentation writes a presence channel: a key in
// the channel config, `track` after SUBSCRIBED, and the state read back
// with `presenceState()`.
//
// The point of asking through the client rather than over a raw socket
// is that presence is a protocol with a client side to it. The server
// sends a state once and diffs after that, and the client folds them
// into the object the application reads. A server that sends a diff the
// fold cannot apply is a server whose own socket tests all pass and
// whose users see a room that slowly stops matching reality.

import { createClient, RealtimeChannel, SupabaseClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.ZOU_URL ?? 'http://127.0.0.1:54321'
// The anon key the supabase CLI prints, signed with the CLI's demo
// secret, so anything told to use that secret takes it.
const ANON_KEY =
  process.env.ZOU_ANON_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0'

// Node 22 and later have a WebSocket of their own. Older ones do not,
// and the client wants to be handed one.
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

/// Subscribe and wait for it, which is what an application does before
/// it tracks anything.
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

/// Poll until the thing being waited for is true, because presence
/// arrives when it arrives and a fixed sleep is either flaky or slow.
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

describe('presence', () => {
  test('a client that tracks itself is in its own state', async () => {
    const room = topic()
    const channel = client().channel(room, { config: { presence: { key: 'u1' } } })
    // The listener is what turns presence on for this channel: the
    // client sets `enabled` in the join for anybody with a presence
    // binding, and for nobody else.
    channel.on('presence', { event: 'sync' }, () => {})
    await subscribed(channel)
    expect(channel.presenceState()).toEqual({})

    const sent = await channel.track({ typing: false })
    expect(sent).toBe('ok')
    await until('the tracker to see itself', () => Object.keys(channel.presenceState()).length === 1)

    const state: any = channel.presenceState()
    expect(state.u1).toHaveLength(1)
    expect(state.u1[0].typing).toBe(false)
    // The ref the client tells one meta from another by, which it
    // renames out of the phx_ref the server sends.
    expect(typeof state.u1[0].presence_ref).toBe('string')
  })

  test('a client that arrives later is told who is already there', async () => {
    const room = topic()
    const first = client().channel(room, { config: { presence: { key: 'u1' } } })
    first.on('presence', { event: 'sync' }, () => {})
    await subscribed(first)
    await first.track({ at: 'first' })
    await until('the first to see itself', () => Object.keys(first.presenceState()).length === 1)

    // The whole question: this channel has heard no diff at all, and
    // has to know about u1 anyway.
    const late = client().channel(room, { config: { presence: { key: 'u2' } } })
    let synced = 0
    late.on('presence', { event: 'sync' }, () => synced++)
    await subscribed(late)
    await until('the state to arrive', () => Object.keys(late.presenceState()).length === 1)

    const state: any = late.presenceState()
    expect(state.u1[0].at).toBe('first')
    expect(synced).toBeGreaterThan(0)
  })

  test('a client that joins is a join for everybody already there', async () => {
    const room = topic()
    const watching = client().channel(room, { config: { presence: { key: 'u1' } } })
    const joins: any[] = []
    watching.on('presence', { event: 'join' }, (payload) => joins.push(payload))
    await subscribed(watching)
    await watching.track({ at: 'first' })

    const arriving = client().channel(room, { config: { presence: { key: 'u2' } } })
    await subscribed(arriving)
    await arriving.track({ at: 'second' })

    await until('the join', () => joins.some((join) => join.key === 'u2'))
    const join = joins.find((j) => j.key === 'u2')
    expect(join.newPresences[0].at).toBe('second')
    expect(Object.keys(watching.presenceState()).sort()).toEqual(['u1', 'u2'])
  })

  test('an untrack is a leave for everybody else', async () => {
    const room = topic()
    const watching = client().channel(room, { config: { presence: { key: 'u1' } } })
    const leaves: any[] = []
    watching.on('presence', { event: 'leave' }, (payload) => leaves.push(payload))
    await subscribed(watching)
    await watching.track({ at: 'first' })

    const going = client().channel(room, { config: { presence: { key: 'u2' } } })
    await subscribed(going)
    await going.track({ at: 'second' })
    await until('the join', () => Object.keys(watching.presenceState()).length === 2)

    expect(await going.untrack()).toBe('ok')
    await until('the leave', () => leaves.some((leave) => leave.key === 'u2'))
    expect(leaves[0].leftPresences[0].at).toBe('second')
    expect(Object.keys(watching.presenceState())).toEqual(['u1'])
    // The channel is still joined, so it can come back without
    // resubscribing, which is what a user toggling away does.
    await going.track({ at: 'again' })
    await until('the second join', () => Object.keys(watching.presenceState()).length === 2)
  })

  test('a client that goes away leaves without saying anything', async () => {
    const room = topic()
    const watching = client().channel(room, { config: { presence: { key: 'u1' } } })
    watching.on('presence', { event: 'sync' }, () => {})
    await subscribed(watching)
    await watching.track({ at: 'first' })

    const closing = client()
    const going = closing.channel(room, { config: { presence: { key: 'u2' } } })
    await subscribed(going)
    await going.track({ at: 'second' })
    await until('the join', () => Object.keys(watching.presenceState()).length === 2)

    // No untrack and no leave: the connection goes, which is what a
    // closed tab and a dropped network are, and the only case the
    // client cannot announce for itself.
    closing.realtime.disconnect()
    await until('the leave', () => Object.keys(watching.presenceState()).length === 1)
    expect(Object.keys(watching.presenceState())).toEqual(['u1'])
  })

  test('one key in two tabs is two metas and one closing takes one', async () => {
    const room = topic()
    const watching = client().channel(room, { config: { presence: { key: 'watcher' } } })
    watching.on('presence', { event: 'sync' }, () => {})
    await subscribed(watching)

    const one = client().channel(room, { config: { presence: { key: 'u1' } } })
    const two = client().channel(room, { config: { presence: { key: 'u1' } } })
    await subscribed(one)
    await subscribed(two)
    await one.track({ tab: 1 })
    await two.track({ tab: 2 })

    await until('both tabs', () => (watching.presenceState() as any).u1?.length === 2)
    const tabs: any = watching.presenceState()
    expect(tabs.u1.map((meta: any) => meta.tab).sort()).toEqual([1, 2])
    expect(tabs.u1[0].presence_ref).not.toBe(tabs.u1[1].presence_ref)

    await one.untrack()
    await until('one tab left', () => (watching.presenceState() as any).u1?.length === 1)
    expect((watching.presenceState() as any).u1[0].tab).toBe(2)
  })

  test('a client that tracks with no key of its own is still seen', async () => {
    const room = topic()
    const watching = client().channel(room, { config: { presence: { key: 'u1' } } })
    watching.on('presence', { event: 'sync' }, () => {})
    await subscribed(watching)
    await watching.track({ named: true })

    const anonymous = client().channel(room)
    await subscribed(anonymous)
    await anonymous.track({ named: false })

    await until('the anonymous one', () => Object.keys(watching.presenceState()).length === 2)
    const state: any = watching.presenceState()
    const key = Object.keys(state).find((k) => k !== 'u1')!
    expect(state[key][0].named).toBe(false)
  })

  test('presence and broadcast are the same channel', async () => {
    const room = topic()
    const listening = client().channel(room, { config: { presence: { key: 'u1' } } })
    const heard: any[] = []
    listening.on('broadcast', { event: 'cursor' }, (payload) => heard.push(payload))
    listening.on('presence', { event: 'sync' }, () => {})
    await subscribed(listening)
    await listening.track({ at: [0, 0] })

    const sending = client().channel(room, { config: { presence: { key: 'u2' } } })
    await subscribed(sending)
    await sending.track({ at: [1, 1] })
    await sending.send({ type: 'broadcast', event: 'cursor', payload: { x: 12, y: 40 } })

    await until('the broadcast', () => heard.length > 0)
    expect(heard[0].payload).toEqual({ x: 12, y: 40 })
    expect(Object.keys(listening.presenceState()).sort()).toEqual(['u1', 'u2'])
  })
})
