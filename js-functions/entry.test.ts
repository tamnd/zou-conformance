// The three ways a module says what to run.
//
// One of them is in the documentation and the other two are what is in
// the wild: most examples predate `Deno.serve` and use the `serve()`
// out of std, and a smaller set writes `export default { fetch }`.
// A runtime that took only the documented one would refuse most of the
// functions people already have, so all three are asked of both
// servers.

import { expect, test } from 'vitest'

import { invoke, json, NAME } from './shared'

test(`${NAME} runs a Deno.serve handler`, async () => {
  const said = await json('entry-serve')
  expect(said.said).toBe('deno.serve')
  expect(said.method).toBe('GET')
})

test(`${NAME} runs a default export with a fetch`, async () => {
  const said = await json('entry-default')
  expect(said.said).toBe('default export')
  expect(said.method).toBe('GET')
})

test(`${NAME} runs the serve() the older examples import`, async () => {
  const said = await json('entry-std')
  expect(said.said).toBe('std serve')
  expect(said.method).toBe('GET')
})

// The name is the first segment and everything after it is the
// function's, query string included. Only the path is asserted, not the
// whole url: the local stack reaches its runtime on an internal
// hostname of its own and zou reaches it on the one the caller used,
// which is documented on both sides and is not what this asks about.
test(`${NAME} hands the path after the name to the function`, async () => {
  const said = await json('echo', { tail: '/one/two?q=1&q=2' })
  expect(said.pathname.endsWith('/one/two')).toBe(true)
  expect(said.search).toBe('?q=1&q=2')
})

test(`${NAME} reaches the function with every method`, async () => {
  for (const method of ['GET', 'POST', 'PUT', 'PATCH', 'DELETE']) {
    const said = await json('echo', {
      method,
      body: method === 'GET' ? undefined : 'a body',
      headers: { 'x-sent': method },
    })
    expect(said.method).toBe(method)
    expect(said.sent).toBe(method)
    expect(said.body).toBe(method === 'GET' ? '' : 'a body')
  }
})

// A function the config file named rather than the listing, whose
// entrypoint is two directories down and which imports the file next to
// it. The Supabase examples project has one of these and the local
// stack serves it, so a runtime that only reads the listing refuses a
// function people already deploy.
test(`${NAME} serves a function whose entrypoint is somewhere else`, async () => {
  const said = await json('entry-elsewhere')
  expect(said.said).toBe('an entrypoint somewhere else')
  expect(said.pathname.endsWith('/entry-elsewhere')).toBe(true)
})

// And the directory it is under is not a function of its own, which is
// the half that says this is the block adding a name rather than the
// listing having learned to walk.
test(`${NAME} does not serve the directory that entrypoint is under`, async () => {
  const res = await invoke('nested')
  expect(res.status).toBe(404)
  expect((await res.text()).trim()).toBe('Function not found')
})
