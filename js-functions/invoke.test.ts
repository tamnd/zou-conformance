// The invocation: the client, the refusals, the two error pages, and
// the answer that arrives before the work behind it has finished.

import { expect, test } from 'vitest'
import { createClient } from '@supabase/supabase-js'

import { ANON_KEY, at, invoke, keyed, NAME, signedWithSomethingElse, SUPABASE_URL } from './shared'

test(`${NAME} answers supabase-js functions.invoke`, async () => {
  const supabase = createClient(SUPABASE_URL, ANON_KEY)
  const { data, error } = await supabase.functions.invoke('echo', {
    body: { hello: 'world' },
  })
  expect(error).toBeNull()
  expect(data.method).toBe('POST')
  expect(data.contentType).toBe('application/json')
  expect(JSON.parse(data.body)).toEqual({ hello: 'world' })
})

test(`${NAME} refuses a call with no token`, async () => {
  const res = await fetch(at('echo'))
  expect(res.status).toBe(401)
  expect(res.headers.get('sb-error-code')).toBe('UNAUTHORIZED_NO_AUTH_HEADER')
  const said = await res.json()
  expect(said.code).toBe('UNAUTHORIZED_NO_AUTH_HEADER')
  expect(said.message).toBe('Missing authorization header')
  expect(said.msg).toBe(said.message)
})

// Two refusals rather than one, because the two are told apart before
// anything is verified. A string that is not a token in the first place
// never reaches a signature check, and the answer says so.
test(`${NAME} refuses a token it cannot read`, async () => {
  const res = await fetch(at('echo'), {
    headers: { Authorization: 'Bearer not.a.token', apikey: ANON_KEY },
  })
  expect(res.status).toBe(401)
  expect(res.headers.get('sb-error-code')).toBe('UNAUTHORIZED_INVALID_JWT_FORMAT')
  const said = await res.json()
  expect(said.code).toBe('UNAUTHORIZED_INVALID_JWT_FORMAT')
  expect(said.message).toBe('Invalid JWT format')
  expect(said.msg).toBe(said.message)
})

test(`${NAME} refuses a token signed with something else`, async () => {
  const res = await fetch(at('echo'), {
    headers: { Authorization: `Bearer ${signedWithSomethingElse()}`, apikey: ANON_KEY },
  })
  expect(res.status).toBe(401)
  expect(res.headers.get('sb-error-code')).toBe('UNAUTHORIZED_LEGACY_JWT')
  const said = await res.json()
  expect(said.code).toBe('UNAUTHORIZED_LEGACY_JWT')
  expect(said.message).toBe('Invalid JWT')
  expect(said.msg).toBe(said.message)
})

test(`${NAME} lets a function with verify_jwt off be called with nothing`, async () => {
  const res = await fetch(at('open'))
  expect(res.status).toBe(200)
  expect(await res.text()).toBe('no token needed')
})

test(`${NAME} says a name nobody deployed is not found`, async () => {
  const res = await invoke('nobody-deployed-this')
  expect(res.status).toBe(404)
  expect((await res.text()).trim()).toBe('Function not found')
})

test(`${NAME} says a handler that threw is the server's problem`, async () => {
  const res = await invoke('throws')
  expect(res.status).toBe(500)
  expect((await res.text()).trim()).toBe('Internal Server Error')
})

test(`${NAME} answers before the work left behind has finished`, async () => {
  const started = Date.now()
  const res = await fetch(at('wait'), { headers: keyed() })
  const took = Date.now() - started
  expect(res.status).toBe(200)
  expect(await res.text()).toBe('answered')
  // The work is a second and a half. An answer that waited for it is a
  // waitUntil that is not one.
  expect(took).toBeLessThan(1200)
})
