// postgres_changes, asked through the client that subscribes to a
// table, and the frames the server sent to make it happen.
//
// The other realtime suites here are about messages a client sent. This
// one is about rows: a table is added to the `supabase_realtime`
// publication, somebody writes to it over `/rest/v1`, and whoever
// subscribed is told. Nothing in the file writes to the database
// directly, because a suite that held a connection could set up a row
// in a way an application never could.
//
// The questions are ours. supabase-js ships an integration suite and it
// subscribes to no tables, so there is nothing to copy, and these are
// written the way the Supabase documentation writes a subscription: a
// channel, an `on('postgres_changes', ...)` with a schema and a table on
// it, and a callback that gets `eventType`, `new` and `old`.
//
// The last test in the file is a different kind of question. Everything
// above it reads what the client handed the application, which is the
// fold of the frames rather than the frames, and a server can get the
// fold right while sending something upstream never sends. So the
// frames themselves are recorded off the socket, with the parts that
// cannot repeat replaced, and compared with what Supabase Realtime sent
// for the same three writes. That recording is `frames.json` next to
// this file, and it was taken from a real `supabase start`.

import { createHmac } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { createClient, RealtimeChannel, SupabaseClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.ZOU_URL ?? 'http://127.0.0.1:54321'
const ANON_KEY =
  process.env.ZOU_ANON_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0'
const JWT_SECRET =
  process.env.ZOU_JWT_SECRET ?? 'super-secret-jwt-token-with-at-least-32-characters-long'

// Writing the recording rather than checking against it, which is what
// a run against the reference does. The file it writes is the answer,
// so a run in this mode asserts nothing about frames.
const RECORDING = process.env.ZOU_RECORD === '1'
const GOLDEN = new URL('./frames.json', import.meta.url)

// The two people the row level security question is asked as.
const PERSON = '6f8a1d20-2f0a-4a2e-9a1d-0a8f1c2b3d4e'
const OTHER = '11111111-2222-3333-4444-555555555555'

const WATCHED = 'conformance_watched'
const FULL = 'conformance_watched_full'
const MINE = 'conformance_watched_mine'
const GOLDEN_TABLE = 'conformance_golden'
const UNWATCHED = 'conformance_unwatched'

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

function token(role: string, sub?: string): string {
  const now = Math.floor(Date.now() / 1000)
  const head = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
  const claims: Record<string, unknown> = { role, iat: now, exp: now + 3600 }
  if (sub) claims.sub = sub
  const body = b64url(JSON.stringify(claims))
  const signature = createHmac('sha256', JWT_SECRET).update(`${head}.${body}`).digest('base64url')
  return `${head}.${body}.${signature}`
}

const SERVICE = token('service_role')

const clients: SupabaseClient[] = []
// Every frame the last client opened was sent, in order, as it came off
// the wire. Only the golden test reads this.
let frames: string[] = []

/// The transport the client is given, which is the real one with a tap
/// on it. A frame is recorded before the client has decoded it, so what
/// is compared is what the server sent rather than what the client made
/// of it.
function recorder(): any {
  // Whichever the client would have used on its own: node 22 has a
  // WebSocket of its own and older ones have the package.
  const base = wsTransport ?? (globalThis as any).WebSocket
  if (!base) return undefined
  return class Tapped extends base {
    constructor(...args: any[]) {
      super(...args)
      this.addEventListener('message', (event: any) => {
        if (typeof event.data === 'string') frames.push(event.data)
      })
    }
  }
}

/// A client, as the person the claims say or as nobody but the project
/// key.
async function client(sub?: string): Promise<SupabaseClient> {
  const transport = recorder()
  const made = createClient(SUPABASE_URL, ANON_KEY, {
    realtime: { heartbeatIntervalMs: 25000, ...(transport && { transport }) },
  })
  clients.push(made)
  if (sub) await made.realtime.setAuth(token('authenticated', sub))
  return made
}

afterEach(async () => {
  await Promise.all(clients.splice(0).map((c) => c.removeAllChannels()))
})

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

/// A join, waited for the way anybody who writes as soon as they have
/// subscribed has to wait for it.
///
/// `SUBSCRIBED` is the join reply and it is not the whole answer. The
/// changes are read off the write ahead log by something that is set up
/// alongside the channel, and until that is running a write goes past
/// with nobody watching, which is a lost change and no error anywhere.
/// The server says when it is running: a `system` event on the channel
/// reading `Subscribed to PostgreSQL`. supabase-js does nothing with it
/// beyond handing it to whoever asked, so asking is what this does.
///
/// It matters on a server that has just started, where the first
/// subscriber to a project is the one that has to wait, and the gap is
/// seconds rather than nothing.
///
/// What the frame says is not asserted here, and that is deliberate.
/// Supabase Realtime answers a subscription to a table that is not in
/// the publication with the same frame carrying `status: error` and a
/// message naming the parameters, where zou says `ok` and then has
/// nothing to send. That is a difference between the servers rather
/// than a question this file is asking, and it is written down as an
/// issue there.
async function subscribed(channel: RealtimeChannel): Promise<string> {
  let said = false
  channel.on('system' as any, {} as any, (payload: any) => {
    if (payload?.extension === 'postgres_changes') said = true
  })
  const state = await status(channel)
  if (state !== 'SUBSCRIBED') return state
  await until('the server to say what became of the subscriptions', () => said)
  return state
}

async function until(what: string, ready: () => boolean): Promise<void> {
  for (let attempt = 0; attempt < 200; attempt++) {
    if (ready()) return
    await new Promise((resolve) => setTimeout(resolve, 50))
  }
  throw new Error(`timed out waiting for ${what}`)
}

/// The change a test is about, waited for and handed back.
///
/// A test that writes a row before it subscribes can be sent that write
/// anyway: Supabase Realtime reads the write ahead log on a timer and
/// gives the batch to whoever is subscribed when it lands, so a commit a
/// moment before a join can arrive after it. That is the server being
/// generous rather than wrong, and it is not what any of these tests are
/// asking about, so a test names the change it means instead of taking
/// whichever came first.
async function change(heard: any[], what: string, is: (change: any) => boolean): Promise<any> {
  await until(what, () => heard.some(is))
  return heard.find(is)
}

const of = (eventType: string, id: number) => (change: any) =>
  change.eventType === eventType && (change.new?.id ?? change.old?.id) === id

/// Somebody subscribed to a table, and the changes they are being told
/// about. `filter` is the whole of what the client sends, so a test can
/// ask for one event, one row, or everything.
async function watching(
  topic: string,
  filter: Record<string, string>,
  sub?: string
): Promise<any[]> {
  const heard: any[] = []
  const channel = (await client(sub)).channel(topic)
  channel.on('postgres_changes', { event: '*', schema: 'public', ...filter } as any, (change) =>
    heard.push(change)
  )
  expect(await subscribed(channel)).toBe('SUBSCRIBED')
  return heard
}

/// A write, as the service key, over the same rest api an application
/// writes through. Nothing in this suite talks to postgres.
async function wrote(method: string, path: string, body?: unknown): Promise<Response> {
  const answer = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method,
    headers: {
      apikey: ANON_KEY,
      Authorization: `Bearer ${SERVICE}`,
      'Content-Type': 'application/json',
      'Content-Profile': 'public',
      Prefer: 'return=minimal',
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
  if (answer.status >= 300) {
    throw new Error(`${method} ${path} answered ${answer.status}: ${await answer.text()}`)
  }
  return answer
}

const insert = (table: string, row: Record<string, unknown>) => wrote('POST', table, row)
const update = (table: string, id: number, row: Record<string, unknown>) =>
  wrote('PATCH', `${table}?id=eq.${id}`, row)
const remove = (table: string, id: number) => wrote('DELETE', `${table}?id=eq.${id}`)

describe('postgres changes', () => {
  test('an insert arrives as the row that was written', async () => {
    const heard = await watching('inserted', { table: WATCHED })

    await insert(WATCHED, { id: 1, body: 'wash up', tally: 3 })
    await until('the insert', () => heard.length > 0)

    expect(heard).toHaveLength(1)
    expect(heard[0].eventType).toBe('INSERT')
    expect(heard[0].schema).toBe('public')
    expect(heard[0].table).toBe(WATCHED)
    // Json rather than the text postgres prints, which is the whole
    // difference between a change and a line of a log.
    expect(heard[0].new).toEqual({ id: 1, body: 'wash up', tally: 3 })
    expect(heard[0].old).toEqual({})
    expect(heard[0].errors).toBeNull()
    // When the transaction committed, not when the row was written, so
    // it is a time rather than a promise of one.
    expect(new Date(heard[0].commit_timestamp).getTime()).toBeGreaterThan(0)
  })

  test('an update carries what the row became and the key of the row it was', async () => {
    await insert(WATCHED, { id: 2, body: 'before', tally: 1 })
    const heard = await watching('updated', { table: WATCHED })

    await update(WATCHED, 2, { body: 'after', tally: 2 })
    const seen = await change(heard, 'the update', of('UPDATE', 2))

    expect(seen.new).toEqual({ id: 2, body: 'after', tally: 2 })
    // The key and nothing else, and this is the line that surprises
    // people. A table with the default replica identity writes no old
    // row into the log when the key did not move, so what names the row
    // is the key, which is the same key the new row carries. Anything
    // more than that is the table below.
    expect(seen.old).toEqual({ id: 2 })
  })

  test('a delete carries the key of the row that went', async () => {
    await insert(WATCHED, { id: 3, body: 'here', tally: 1 })
    const heard = await watching('deleted', { table: WATCHED })

    await remove(WATCHED, 3)
    const seen = await change(heard, 'the delete', of('DELETE', 3))

    expect(seen.old).toEqual({ id: 3 })
    expect(seen.new).toEqual({})
  })

  test('a table that publishes its old rows says what the row was', async () => {
    await insert(FULL, { id: 1, body: 'before', tally: 1 })
    const heard = await watching('full', { table: FULL })

    await update(FULL, 1, { body: 'after' })
    const updated = await change(heard, 'the update', of('UPDATE', 1))
    expect(updated.old).toEqual({ id: 1, body: 'before', tally: 1 })

    await remove(FULL, 1)
    const deleted = await change(heard, 'the delete', of('DELETE', 1))
    expect(deleted.old).toEqual({ id: 1, body: 'after', tally: 1 })
  })

  test('a subscription for one event hears that one and not the others', async () => {
    const heard = await watching('one-event', { table: WATCHED, event: 'INSERT' })

    await insert(WATCHED, { id: 4, body: 'kept', tally: 1 })
    await update(WATCHED, 4, { body: 'changed' })
    await remove(WATCHED, 4)

    await until('the insert', () => heard.length > 0)
    // The update and the delete are behind the insert in the same
    // stream, so by the time a later write has arrived anywhere they
    // have been decided about.
    await insert(WATCHED, { id: 5, body: 'kept too', tally: 1 })
    await until('the second insert', () => heard.length > 1)

    expect(heard.map((change) => change.eventType)).toEqual(['INSERT', 'INSERT'])
  })

  test('a filter is one column compared with one value', async () => {
    const heard = await watching('filtered', { table: WATCHED, filter: 'id=eq.7' })

    await insert(WATCHED, { id: 6, body: 'not this one', tally: 1 })
    await insert(WATCHED, { id: 7, body: 'this one', tally: 1 })
    await until('the row the filter names', () => heard.length > 0)

    expect(heard).toHaveLength(1)
    expect(heard[0].new.id).toBe(7)
  })

  test('a table nobody put in the publication is not heard from', async () => {
    const watched = await watching('quiet', { table: WATCHED })
    const unwatched = await watching('quiet-too', { table: UNWATCHED })

    await insert(UNWATCHED, { id: 1, body: 'nobody asked' })
    // A write to a table that is watched, after it, as the thing to
    // wait for: a suite that waited on a clock would pass on a server
    // that was merely slow.
    await insert(WATCHED, { id: 8, body: 'the one that is', tally: 1 })
    await until('the write to the watched table', () => watched.length > 0)

    expect(unwatched).toHaveLength(0)
  })

  test('a subscriber is sent the rows a policy would have shown them', async () => {
    const mine = await watching('rls', { table: MINE }, PERSON)

    await insert(MINE, { id: 1, owner: OTHER, body: 'not yours' })
    await insert(MINE, { id: 2, owner: PERSON, body: 'yours' })
    await until('the row the policy allows', () => mine.length > 0)

    expect(mine).toHaveLength(1)
    expect(mine[0].new).toEqual({ id: 2, owner: PERSON, body: 'yours' })
  })

  test('a delete on a table with policies tells everybody the key and nothing else', async () => {
    await insert(MINE, { id: 3, owner: OTHER, body: 'a secret' })
    const mine = await watching('rls-delete', { table: MINE }, PERSON)

    // The row is gone, so no policy can be asked about it, and a
    // subscriber who could never have selected it is still told it
    // went. What they are told is the key.
    await remove(MINE, 3)
    const seen = await change(mine, 'the delete', of('DELETE', 3))

    expect(seen.old).toEqual({ id: 3 })
    expect(seen.new).toEqual({})
  })

  test('two subscriptions on one channel are two callbacks', async () => {
    const inserts: any[] = []
    const deletes: any[] = []
    const channel = (await client()).channel('two')
    channel.on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: WATCHED } as any,
      (change) => inserts.push(change)
    )
    channel.on(
      'postgres_changes',
      { event: 'DELETE', schema: 'public', table: WATCHED } as any,
      (change) => deletes.push(change)
    )
    expect(await subscribed(channel)).toBe('SUBSCRIBED')

    await insert(WATCHED, { id: 9, body: 'both', tally: 1 })
    await remove(WATCHED, 9)
    await until('both halves', () => inserts.length > 0 && deletes.length > 0)

    expect(inserts).toHaveLength(1)
    expect(deletes).toHaveLength(1)
    expect(inserts[0].new.id).toBe(9)
    expect(deletes[0].old.id).toBe(9)
  })

  // The frames, rather than what the client made of them.
  //
  // A subscription is two things a client depends on that no assertion
  // above can see. The join is answered with the subscriptions the
  // server made, each carrying an id, in the order they were asked for,
  // and the client walks that list against its own bindings and errors
  // the channel if they do not line up. Then every change carries those
  // ids, and the client routes on them: a change whose ids name no
  // binding is dropped in silence.
  //
  // So the ids are replaced here rather than dropped, by the position
  // they held in the join's answer, which keeps the one thing that
  // matters about them, that the change came back naming the
  // subscription the join made.
  //
  // The table is this test's own, because a golden is every frame the
  // channel was sent and the reference hands out a batch that can reach
  // back over a join. A table nobody else writes to is what makes the
  // recording the three writes below and no others.
  test('the frames are the ones Supabase Realtime sends', async () => {
    frames = []
    const heard: any[] = []
    const channel = (await client(PERSON)).channel('golden')
    channel.on(
      'postgres_changes',
      { event: '*', schema: 'public', table: GOLDEN_TABLE } as any,
      (change) => heard.push(change)
    )
    expect(await subscribed(channel)).toBe('SUBSCRIBED')

    await insert(GOLDEN_TABLE, { id: 10, body: 'a golden row', tally: 1 })
    await update(GOLDEN_TABLE, 10, { tally: 2 })
    await remove(GOLDEN_TABLE, 10)
    await until('all three changes', () => heard.length >= 3)

    const seen = normalise(frames)
    if (RECORDING) {
      writeFileSync(
        GOLDEN,
        JSON.stringify(
          {
            note: RECORDED_NOTE,
            recorded_from: 'supabase start',
            frames: seen,
          },
          null,
          2
        ) + '\n'
      )
      console.warn(`recorded ${seen.length} frames into frames.json`)
      return
    }
    expect(seen).toEqual(JSON.parse(readFileSync(GOLDEN, 'utf8')).frames)
  })
})

const RECORDED_NOTE = [
  'The frames Supabase Realtime sent to a channel subscribed to one table, for an insert, an update and a delete of one row.',
  'Written by changes.test.ts with ZOU_RECORD=1 against a real supabase start, and compared by the same file against zou.',
  'The refs, the subscription ids and the commit timestamp cannot repeat, so they are replaced: a ref by whether it is the join push it answers, an id by the position it held in the join answer, and the timestamp by the fact that there was one.',
]

/// A frame as it can be compared with the same frame sent by another
/// server on another day.
///
/// Three things in it are true of a run rather than of a server. The
/// refs are a counter this client kept, the subscription ids are
/// whatever the server minted, and the commit timestamp is when the
/// write happened. Everything else is the server's answer and is
/// compared as it arrived, every frame, every field and every value,
/// with the order of the frames being part of it. The order of the keys
/// inside one is not: json objects are compared as objects, the same
/// way every client that reads them does.
function normalise(raw: string[]): unknown[] {
  // The ids the join's answer handed back, in the order it handed them
  // back, which is the order the client asked in.
  const ids: number[] = []
  /// An id as the position it held in that list, which is what a client
  /// routes on. Anything else names no subscription this channel made,
  /// which is worth saying rather than hiding.
  const named = (id: number): string => {
    const at = ids.indexOf(id)
    return at < 0 ? '<unknown subscription>' : `<subscription ${at}>`
  }
  const frames: unknown[] = []
  for (const line of raw) {
    const [join_ref, ref, topic, event, payload] = JSON.parse(line)
    // The heartbeat is the client's own clock rather than an answer
    // about anything here.
    if (topic === 'phoenix') continue
    let seen = payload
    const answered = payload?.response?.postgres_changes
    if (Array.isArray(answered)) {
      for (const one of answered) if (typeof one.id === 'number') ids.push(one.id)
      seen = {
        ...payload,
        response: {
          ...payload.response,
          postgres_changes: answered.map((one: any) => ({ ...one, id: named(one.id) })),
        },
      }
    }
    if (Array.isArray(payload?.ids)) {
      seen = {
        ...payload,
        ids: payload.ids.map((one: number) => named(one)),
        data: { ...payload.data, commit_timestamp: '<timestamp>' },
      }
    }
    frames.push({
      join_ref: join_ref === null ? null : '<ref>',
      ref: ref === null ? null : '<ref>',
      topic,
      event,
      payload: seen,
    })
  }
  return frames
}
