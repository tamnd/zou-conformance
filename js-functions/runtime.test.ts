// What the runtime gives the function: the environment, the web
// surface, a body that arrives as it is made, and the headers
// describing the request that reached the front door.

import { expect, test } from 'vitest'

import { at, invoke, json, keyed, NAME, REFERENCE } from './shared'

test(`${NAME} sets the variables a project is promised`, async () => {
  const said = await json('env')
  expect(said.set).toMatchObject({
    SUPABASE_URL: true,
    SUPABASE_ANON_KEY: true,
    SUPABASE_SERVICE_ROLE_KEY: true,
    SUPABASE_DB_URL: true,
    SB_EXECUTION_ID: true,
  })
  expect(said.edgeRuntime).toBe('object')
  expect(said.waitUntil).toBe('function')
})

// The key maps are the newer names and they are what most of the
// Supabase examples project reads now, by way of `@supabase/server`,
// which builds its client before the handler runs and refuses the
// request if it cannot find a key. Neither side is asked what the key
// is: the reference issues `sb_publishable_` and `sb_secret_` strings
// and zou hands over the project's own keys, and a library treats
// either as opaque and sends it back as the apikey.
test(`${NAME} names a default publishable and secret key`, async () => {
  const said = await json('env')
  expect(said.set.SUPABASE_PUBLISHABLE_KEYS).toBe(true)
  expect(said.set.SUPABASE_SECRET_KEYS).toBe(true)
  expect(said.defaults).toEqual({
    SUPABASE_PUBLISHABLE_KEYS: true,
    SUPABASE_SECRET_KEYS: true,
  })
})

// The second divergence, and the one worth reading the comment for.
//
// `SB_EXECUTION_ID` is a uuid on both, and on the local stack it is
// minted when the worker is made rather than when a call arrives, so
// every call into a kept worker sees the same one: five calls a second
// apart were measured returning one id. zou mints it per call, which is
// what the name says and what a log line naming an execution is only
// useful as. Both are asked here so that either of them changing is a
// failure rather than a surprise.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

test(`${NAME} says which execution a call was`, async () => {
  const one = await json('env')
  const two = await json('env')
  expect(one.execution).toMatch(UUID)
  expect(two.execution).toMatch(UUID)
  if (REFERENCE) {
    // The worker's, handed to every call it serves.
    expect(one.execution).toBe(two.execution)
  } else {
    // The call's.
    expect(one.execution).not.toBe(two.execution)
  }
})

// The third divergence, and the one zou is on the wrong side of.
//
// `supabase start` publishes the project's signing keys as a jwks, so a
// function verifying a token itself can do it without asking the api.
// zou signs a project's tokens with one shared secret and has nothing
// asymmetric to publish, so the variable is unset and a function that
// wants the keys has to ask the api for them. Asked here so that zou
// growing project keys is a failure in this file rather than something
// nobody notices.
test(`${NAME} says whether the signing keys are published`, async () => {
  const said = await json('env')
  expect(said.set.SUPABASE_JWKS).toBe(REFERENCE)
})

test(`${NAME} has the web surface a handler is written against`, async () => {
  const said = await json('web')
  for (const [name, kind] of Object.entries(said.there)) {
    expect(`${name} is ${kind}`).not.toBe(`${name} is undefined`)
  }
  for (const [name, kind] of Object.entries(said.deno)) {
    expect(`Deno.${name} is ${kind}`).not.toBe(`Deno.${name} is undefined`)
  }
  expect(said.uuid).toBe(36)
  expect(said.digest).toBe(32)
  expect(said.encoded).toEqual([104, 195, 169])
  expect(said.base64).toBe('aGVsbG8=')
})

test(`${NAME} sends a stream as it is made`, async () => {
  const res = await fetch(at('stream'), { headers: keyed() })
  expect(res.status).toBe(200)
  expect(res.body).not.toBeNull()
  const decoder = new TextDecoder()
  const arrived: number[] = []
  let text = ''
  const started = Date.now()
  for await (const chunk of res.body as unknown as AsyncIterable<Uint8Array>) {
    text += decoder.decode(chunk, { stream: true })
    arrived.push(Date.now() - started)
  }
  expect(text).toBe('chunk 1\nchunk 2\nchunk 3\nchunk 4\nchunk 5\n')
  // Five chunks, 120 ms apart. A caller handed the whole thing at the
  // end sees one arrival, whatever the body says.
  expect(arrived.length).toBeGreaterThan(1)
  expect(arrived[arrived.length - 1]).toBeGreaterThan(200)
})

test(`${NAME} tells the function about the request that reached it`, async () => {
  const said = await json('forwarded', { tail: '?q=1' })
  expect(said.headers.authorization).toMatch(/^Bearer /)
  expect(said.search).toBe('?q=1')
  // The runtime is behind something on both, so the forwarded host is
  // what the caller asked for rather than what the runtime is listening
  // on. What that something is differs, and is not asked here.
  expect(said.headers['x-forwarded-host']).toBeTruthy()
})

// The one place a client can see which server it is talking to, and it
// is written down as a divergence in the zou repository rather than
// treated as a defect.
//
// The local stack puts kong in front, and kong answers every preflight
// itself with `*` before the function is reached, and replaces the
// `Access-Control-Allow-Origin` a function set with `*` on ordinary
// answers as well. zou hands the preflight to the function, the way the
// hosted runtime does, so that the `_shared/cors.ts` in every example
// is the thing deciding.
test(`${NAME} answers a preflight the way it documents`, async () => {
  const res = await fetch(at('cors'), {
    method: 'OPTIONS',
    headers: {
      Origin: 'https://example.com',
      'Access-Control-Request-Method': 'POST',
      'Access-Control-Request-Headers': 'authorization, content-type',
    },
  })
  expect(res.headers.get('access-control-allow-origin')).toBe('*')
  if (REFERENCE) {
    // kong, which answers it and never asks the function.
    expect(res.status).toBe(200)
  } else {
    // The function, which said `ok` with the headers it chose.
    expect(res.status).toBe(200)
    expect(await res.text()).toBe('ok')
  }
})

test(`${NAME} lets a function set its own CORS headers on an answer`, async () => {
  const res = await invoke('cors')
  expect(res.status).toBe(200)
  expect(await res.text()).toBe('answered')
  expect(res.headers.get('access-control-allow-origin')).toBe('*')
  expect(res.headers.get('access-control-allow-headers')).toBe(
    'authorization, x-client-info, apikey, content-type',
  )
})
