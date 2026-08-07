// supabase-js's own integration suite, pointed somewhere else.
//
// Upstream keeps this at packages/core/supabase-js/test/integration.test.ts
// and runs it against a local stack brought up with `supabase start`. It
// is the closest thing there is to a statement of what the client needs
// from a server, written by the people who wrote the client, so it is
// worth running unchanged rather than paraphrasing into questions of our
// own.
//
// The differences from upstream, and nothing else:
//
//   1. the client is imported from the published package rather than
//      from ../src, because there is no supabase-js checkout here
//   2. the url and the keys come from the environment, defaulting to
//      what `supabase start` serves, so the same file can be aimed at a
//      local stack, at a zou, or at a hosted project
//   3. the Realtime block is gated behind an environment flag, because
//      zou does not serve Realtime yet, and a suite that fails on a
//      feature nobody has written is noise rather than a measurement.
//      The Storage block ran under a flag of its own until zou served
//      storage, and is upstream's own line again
//   4. it runs under vitest rather than jest
//   5. an unused `import { assert } from 'console'` is gone, and the
//      dashes in upstream's comments are commas, which is this
//      repository's house style and touches no code
//
// Not one assertion is edited. If a test here fails, zou answered
// differently from the server upstream wrote the test against.
//
// The assertions are upstream's. That makes this suite a different kind
// of thing from the recorded ones next to it: there, nobody writes an
// expectation and the reference's answer is the expectation, because the
// questions are ours. Here the questions and the expectations are both
// upstream's, about upstream's own client, which is the one case where
// an assertion copied from upstream proves something.

import { createClient, RealtimeChannel, SupabaseClient } from '@supabase/supabase-js'
import { sign } from 'jsonwebtoken'

const SUPABASE_URL = process.env.ZOU_URL ?? 'http://127.0.0.1:54321'
const JWT_SECRET =
  process.env.ZOU_JWT_SECRET ?? 'super-secret-jwt-token-with-at-least-32-characters-long'
// The anon key the supabase CLI prints. Signed with the secret above, so
// a server told to use that secret accepts it, whoever wrote the server.
const PUBLISHABLE_KEY =
  process.env.ZOU_ANON_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0'

// zou has no Realtime on this url yet, tamnd/zou#4. Set the flag when
// it does, and the block comes back exactly as upstream wrote it. The
// Storage block below is not gated any more: storage is served,
// tamnd/zou#3, and the fixture makes the bucket and the policy that
// upstream's own migration makes.
const realtime = process.env.ZOU_REALTIME === '1' ? describe : describe.skip

// For Node.js < 22, we need to provide a WebSocket implementation
// Node.js 22+ has native WebSocket support
let wsTransport: any = undefined
if (typeof WebSocket === 'undefined' && typeof process !== 'undefined' && process.versions?.node) {
  try {
    wsTransport = require('ws')
  } catch (error) {
    console.warn('WebSocket not available, Realtime features may not work')
  }
}

const supabase = createClient(SUPABASE_URL, PUBLISHABLE_KEY, {
  realtime: {
    heartbeatIntervalMs: 500,
    ...(wsTransport && { transport: wsTransport }),
  },
})

describe('Supabase Integration Tests', () => {
  test('should connect to Supabase instance', async () => {
    expect(supabase).toBeDefined()
    expect(supabase).toBeInstanceOf(SupabaseClient)
  })

  describe('PostgREST', () => {
    test('should connect to PostgREST API', async () => {
      const { data, error } = await supabase.from('todos').select('*').limit(5)

      // The default schema includes a 'todos' table, but it might be empty
      expect(error).toBeNull()
      expect(Array.isArray(data)).toBe(true)
    })

    // Test creating and deleting data
    test('should create and delete a todo', async () => {
      // Create a new todo
      const { data: createdTodo, error: createError } = await supabase
        .from('todos')
        .insert({ task: 'Integration Test Todo', is_complete: false })
        .select()
        .single()

      expect(createError).toBeNull()
      expect(createdTodo).toBeDefined()
      expect(createdTodo!.task).toBe('Integration Test Todo')
      expect(createdTodo!.is_complete).toBe(false)

      // Delete the created todo
      const { error: deleteError } = await supabase.from('todos').delete().eq('id', createdTodo!.id)

      expect(deleteError).toBeNull()

      // Verify the todo was deleted
      const { data: fetchedTodo, error: fetchError } = await supabase
        .from('todos')
        .select('*')
        .eq('id', createdTodo!.id)
        .single()

      expect(fetchError).not.toBeNull()
      expect(fetchedTodo).toBeNull()
    })
  })

  describe('PostgreSQL RLS', () => {
    let user1Email: string
    let user2Email: string
    let user1Id: string
    let user2Id: string
    let user1TodoId: string
    let user2TodoId: string

    beforeAll(async () => {
      // Create two test users
      user1Email = `user1-${Date.now()}@example.com`
      user2Email = `user2-${Date.now()}@example.com`
      const password = 'password123'

      const { data: user1Data } = await supabase.auth.signUp({
        email: user1Email,
        password,
      })
      user1Id = user1Data.user!.id

      const { data: user2Data } = await supabase.auth.signUp({
        email: user2Email,
        password,
      })
      user2Id = user2Data.user!.id

      // Create todos for both users
      await supabase.auth.signInWithPassword({ email: user1Email, password })
      const { data: user1Todo } = await supabase
        .from('todos')
        .insert({ task: 'User 1 Todo', is_complete: false, user_id: user1Id })
        .select()
        .single()
      user1TodoId = user1Todo!.id

      await supabase.auth.signInWithPassword({ email: user2Email, password })
      const { data: user2Todo } = await supabase
        .from('todos')
        .insert({ task: 'User 2 Todo', is_complete: false, user_id: user2Id })
        .select()
        .single()
      user2TodoId = user2Todo!.id
    })

    afterAll(async () => {
      await supabase.auth.signOut()
    })

    test('should allow anonymous access via RLS policies', async () => {
      await supabase.auth.signOut()

      const { data, error } = await supabase.from('todos').select('*').limit(5)

      expect(error).toBeNull()
      expect(Array.isArray(data)).toBe(true)
    })

    test('should allow authenticated user to access their own data', async () => {
      await supabase.auth.signInWithPassword({ email: user1Email, password: 'password123' })

      const { data, error } = await supabase
        .from('todos')
        .select('*')
        .eq('id', user1TodoId)
        .single()

      expect(error).toBeNull()
      expect(data).toBeDefined()
      expect(data!.task).toBe('User 1 Todo')
    })

    test('should prevent access to other users data', async () => {
      await supabase.auth.signInWithPassword({ email: user1Email, password: 'password123' })

      const { data, error } = await supabase
        .from('todos')
        .select('*')
        .eq('id', user2TodoId)
        .single()

      expect(error).not.toBeNull()
      expect(data).toBeNull()
    })

    test('should allow authenticated user to create their own data', async () => {
      await supabase.auth.signInWithPassword({ email: user1Email, password: 'password123' })

      const { data, error } = await supabase
        .from('todos')
        .insert({ task: 'New User 1 Todo', is_complete: false, user_id: user1Id })
        .select()
        .single()

      expect(error).toBeNull()
      expect(data).toBeDefined()
      expect(data!.task).toBe('New User 1 Todo')
    })

    test('should allow authenticated user to update their own data', async () => {
      await supabase.auth.signInWithPassword({ email: user1Email, password: 'password123' })

      const { data, error } = await supabase
        .from('todos')
        .update({ task: 'Updated User 1 Todo' })
        .eq('id', user1TodoId)
        .select()
        .single()

      expect(error).toBeNull()
      expect(data).toBeDefined()
      expect(data!.task).toBe('Updated User 1 Todo')
    })
  })

  describe('Authentication', () => {
    afterAll(async () => {
      // Clean up by signing out the user
      await supabase.auth.signOut()
    })

    test('should sign up a user', async () => {
      const email = `test-${Date.now()}@example.com`
      const password = 'password123'

      const { data, error } = await supabase.auth.signUp({
        email,
        password,
      })

      expect(error).toBeNull()
      expect(data.user).toBeDefined()
      expect(data.user!.email).toBe(email)
    })

    test('should sign in and out successfully', async () => {
      const email = `test-${Date.now()}@example.com`
      const password = 'password123'

      await supabase.auth.signUp({ email, password })
      const { data, error } = await supabase.auth.signInWithPassword({ email, password })

      expect(error).toBeNull()
      expect(data.user).toBeDefined()
      expect(data.user!.email).toBe(email)

      const { error: signOutError } = await supabase.auth.signOut()

      expect(signOutError).toBeNull()
    })

    test('should get current user', async () => {
      const email = `test-${Date.now()}@example.com`
      const password = 'password123'

      await supabase.auth.signUp({ email, password })
      await supabase.auth.signInWithPassword({ email, password })

      const { data, error } = await supabase.auth.getUser()

      expect(error).toBeNull()
      expect(data.user).toBeDefined()
      expect(data.user!.email).toBe(email)
    })

    test('should handle invalid credentials', async () => {
      const email = `test-${Date.now()}@example.com`
      const password = 'password123'

      await supabase.auth.signUp({ email, password })

      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password: 'wrongpassword',
      })

      expect(error).not.toBeNull()
      expect(data.user).toBeNull()
    })

    test('should handle non-existent user', async () => {
      const email = `nonexistent-${Date.now()}@example.com`
      const password = 'password123'

      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      })

      expect(error).not.toBeNull()
      expect(data.user).toBeNull()
    })
  })

  realtime.each([{ vsn: '1.0.0' }, { vsn: '2.0.0' }])('Realtime with vsn: $vsn', ({ vsn }) => {
    const channelName = `channel-${crypto.randomUUID()}`
    let channel: RealtimeChannel
    let email: string
    let password: string
    let supabase: SupabaseClient

    beforeEach(async () => {
      // Create client with specific version
      supabase = createClient(SUPABASE_URL, PUBLISHABLE_KEY, {
        realtime: {
          heartbeatIntervalMs: 500,
          vsn,
          ...(wsTransport && { transport: wsTransport }),
        },
      })

      await supabase.auth.signOut()
      email = `test-${Date.now()}@example.com`
      password = 'password123'
      await supabase.auth.signUp({ email, password })

      const config = { broadcast: { ack: true, self: true }, private: true }
      channel = supabase.channel(channelName, { config })
    })

    afterEach(async () => {
      await supabase.removeAllChannels()
    })

    test('is able to connect and broadcast', async () => {
      const testMessage = { message: 'test' }
      let receivedMessage: any
      let subscribed = false
      let attempts = 0

      channel
        .on('broadcast', { event: 'test-event' }, (payload) => (receivedMessage = payload))
        .subscribe((status) => {
          if (status == 'SUBSCRIBED') subscribed = true
        })

      // Wait for subscription
      while (!subscribed) {
        if (attempts > 50) throw new Error('Timeout waiting for subscription')
        await new Promise((resolve) => setTimeout(resolve, 100))
        attempts++
      }

      attempts = 0

      await channel.send({ type: 'broadcast', event: 'test-event', payload: testMessage })

      // Wait on message
      while (!receivedMessage) {
        if (attempts > 50) throw new Error('Timeout waiting for message')
        await new Promise((resolve) => setTimeout(resolve, 100))
        attempts++
      }
      expect(receivedMessage).toBeDefined()
      expect(supabase.realtime.getChannels().length).toBe(1)
    }, 10000)

    test('socket stays connected when switching channels (no race condition)', async () => {
      const config = { broadcast: { ack: true, self: true }, private: true }

      // Subscribe channel A and wait for it to be joined
      const channelA = supabase.channel(`${channelName}-a`, { config })
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Timeout waiting for channelA')), 8000)
        channelA.subscribe((status) => {
          if (status === 'SUBSCRIBED') {
            clearTimeout(timeout)
            resolve()
          }
        })
      })

      // Remove channel A, should NOT disconnect immediately
      await supabase.removeChannel(channelA)
      expect(supabase.realtime.isConnected()).toBe(true)

      // Immediately subscribe channel B, should reuse the open socket
      const channelB = supabase.channel(`${channelName}-b`, { config })
      let channelBSubscribed = false
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Timeout waiting for channelB')), 8000)
        channelB
          .on('broadcast', { event: 'ping' }, () => {})
          .subscribe((status) => {
            if (status === 'SUBSCRIBED') {
              channelBSubscribed = true
              clearTimeout(timeout)
              resolve()
            }
          })
      })

      expect(channelBSubscribed).toBe(true)
      // Socket was never disconnected, channelB joined on the existing connection
      expect(supabase.realtime.isConnected()).toBe(true)
    }, 20000)

    test('socket disconnects after removeChannel when no channels remain', async () => {
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(
          () => reject(new Error('Timeout waiting for subscription')),
          8000
        )
        channel.subscribe((status) => {
          if (status === 'SUBSCRIBED') {
            clearTimeout(timeout)
            resolve()
          }
        })
      })

      expect(supabase.realtime.isConnected()).toBe(true)

      await supabase.removeChannel(channel)
      // Deferred disconnect is scheduled, socket still open
      expect(supabase.realtime.isConnected()).toBe(true)

      // Wait for deferred disconnect (2 * heartbeatIntervalMs = 1000 ms)
      await new Promise((resolve) => setTimeout(resolve, 1200))
      expect(supabase.realtime.isConnected()).toBe(false)
    }, 15000)

    test('socket disconnects after channel.unsubscribe() when no channels remain', async () => {
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(
          () => reject(new Error('Timeout waiting for subscription')),
          8000
        )
        channel.subscribe((status) => {
          if (status === 'SUBSCRIBED') {
            clearTimeout(timeout)
            resolve()
          }
        })
      })

      expect(supabase.realtime.isConnected()).toBe(true)

      await channel.unsubscribe()
      // Deferred disconnect is scheduled, socket still open
      expect(supabase.realtime.isConnected()).toBe(true)

      // Wait for deferred disconnect (2 * heartbeatIntervalMs = 1000 ms)
      await new Promise((resolve) => setTimeout(resolve, 1200))
      expect(supabase.realtime.isConnected()).toBe(false)
    }, 15000)

    test('removeAllChannels disconnects socket immediately', async () => {
      const channelA = supabase.channel(`${channelName}-a`)
      const channelB = supabase.channel(`${channelName}-b`)

      await Promise.all([
        new Promise<void>((resolve, reject) => {
          const timeout = setTimeout(() => reject(new Error('Timeout waiting for channelA')), 8000)
          channelA.subscribe((status) => {
            if (status === 'SUBSCRIBED') {
              clearTimeout(timeout)
              resolve()
            }
          })
        }),
        new Promise<void>((resolve, reject) => {
          const timeout = setTimeout(() => reject(new Error('Timeout waiting for channelB')), 8000)
          channelB.subscribe((status) => {
            if (status === 'SUBSCRIBED') {
              clearTimeout(timeout)
              resolve()
            }
          })
        }),
      ])

      expect(supabase.realtime.isConnected()).toBe(true)

      await supabase.removeAllChannels()
      // removeAllChannels is an explicit teardown, no deferred timer, disconnect is immediate
      expect(supabase.realtime.isConnected()).toBe(false)
    }, 20000)

    test('httpSend delivers JSON broadcast to a public channel', async () => {
      const publicChannelName = `public-${crypto.randomUUID()}`
      const publicChannel = supabase.channel(publicChannelName, {
        config: { broadcast: { self: true } },
      })

      let received: any
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('subscribe timeout')), 8000)
        publicChannel
          .on('broadcast', { event: 'json' }, (payload) => {
            received = payload
          })
          .subscribe((status) => {
            if (status === 'SUBSCRIBED') {
              clearTimeout(timeout)
              resolve()
            }
          })
      })

      const result = await publicChannel.httpSend('json', { hello: 'public' })
      expect(result).toEqual({ success: true })

      let attempts = 0
      while (!received) {
        if (attempts++ > 50) throw new Error('Timeout waiting for broadcast')
        await new Promise((r) => setTimeout(r, 100))
      }
      expect(received.payload).toEqual({ hello: 'public' })
    }, 15000)

    test('httpSend delivers JSON broadcast to a private channel', async () => {
      let received: any
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('subscribe timeout')), 8000)
        channel
          .on('broadcast', { event: 'json-private' }, (payload) => {
            received = payload
          })
          .subscribe((status) => {
            if (status === 'SUBSCRIBED') {
              clearTimeout(timeout)
              resolve()
            }
          })
      })

      const result = await channel.httpSend('json-private', { hello: 'private' })
      expect(result).toEqual({ success: true })

      let attempts = 0
      while (!received) {
        if (attempts++ > 50) throw new Error('Timeout waiting for broadcast')
        await new Promise((r) => setTimeout(r, 100))
      }
      expect(received.payload).toEqual({ hello: 'private' })
    }, 15000)

    const binaryBroadcastTest = vsn === '2.0.0' ? test : test.skip
    binaryBroadcastTest(
      'httpSend delivers a binary broadcast to a private channel',
      async () => {
        let received: any
        await new Promise<void>((resolve, reject) => {
          const timeout = setTimeout(() => reject(new Error('subscribe timeout')), 8000)
          channel
            .on('broadcast', { event: 'binary' }, (payload) => {
              received = payload
            })
            .subscribe((status) => {
              if (status === 'SUBSCRIBED') {
                clearTimeout(timeout)
                resolve()
              }
            })
        })

        const bytes = new Uint8Array([1, 2, 3, 4, 5])
        const result = await channel.httpSend('binary', bytes)
        expect(result).toEqual({ success: true })

        let attempts = 0
        while (!received) {
          if (attempts++ > 50) throw new Error('Timeout waiting for broadcast')
          await new Promise((r) => setTimeout(r, 100))
        }
        expect(new Uint8Array(received.payload)).toEqual(bytes)
      },
      15000
    )
  })
})

describe('Storage API', () => {
  const bucket = 'test-bucket'
  const filePath = 'test-file.txt'
  const fileContent = new Blob(['Hello, Supabase Storage!'], { type: 'text/plain' })

  test('upload and list file in bucket', async () => {
    // upload
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from(bucket)
      .upload(filePath, fileContent, { upsert: true })
    expect(uploadError).toBeNull()
    expect(uploadData).toBeDefined()

    // list
    const { data: listData, error: listError } = await supabase.storage.from(bucket).list()
    expect(listError).toBeNull()
    expect(Array.isArray(listData)).toBe(true)
    if (!listData) throw new Error('listData is null')
    const fileNames = listData.map((f: any) => f.name)
    expect(fileNames).toContain('test-file.txt')

    // delete file
    const { error: deleteError } = await supabase.storage.from(bucket).remove([filePath])
    expect(deleteError).toBeNull()
  })
})

describe('PostgREST Timeout Configuration', () => {
  test('should accept timeout option through client configuration', () => {
    const client = createClient(SUPABASE_URL, PUBLISHABLE_KEY, {
      db: { timeout: 5000 },
    })
    expect(client).toBeDefined()
    expect((client as any).rest).toBeDefined()
  })

  test('should work without timeout option', () => {
    const client = createClient(SUPABASE_URL, PUBLISHABLE_KEY, {
      db: { schema: 'public' },
    })
    expect(client).toBeDefined()
    expect((client as any).rest).toBeDefined()
  })

  test('should allow timeout with other db options', () => {
    const client = createClient(SUPABASE_URL, PUBLISHABLE_KEY, {
      db: {
        schema: 'public',
        timeout: 10000,
      },
    })
    expect(client).toBeDefined()
    expect((client as any).rest).toBeDefined()
  })
})

describe('Custom JWT', () => {
  realtime('Realtime', () => {
    test('will connect with a properly signed jwt token', async () => {
      const jwtToken = sign(
        {
          sub: '1234567890',
          role: 'anon',
          iss: 'supabase-demo',
        },
        JWT_SECRET,
        { expiresIn: '1h' }
      )
      const supabaseWithCustomJwt = createClient(SUPABASE_URL, PUBLISHABLE_KEY, {
        accessToken: () => Promise.resolve(jwtToken),
        realtime: {
          ...(wsTransport && { transport: wsTransport }),
        },
      })

      try {
        // Wait for subscription using Promise to avoid polling
        await new Promise<void>((resolve, reject) => {
          const timeout = setTimeout(() => {
            reject(new Error('Timeout waiting for subscription'))
          }, 4000)

          supabaseWithCustomJwt.channel('test-channel').subscribe((status, err) => {
            if (status === 'SUBSCRIBED') {
              clearTimeout(timeout)
              // Verify token was set
              expect(supabaseWithCustomJwt.realtime.accessTokenValue).toBe(jwtToken)
              resolve()
            } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
              clearTimeout(timeout)
              reject(err || new Error(`Subscription failed with status: ${status}`))
            }
          })
        })
      } finally {
        // Always cleanup channels and connection, even if test fails
        await supabaseWithCustomJwt.removeAllChannels()
      }
    }, 5000)
  })
})
