// Supabase's own edge functions test client, driven the way a person
// drives it, against functions that were deployed rather than served
// off a directory.
//
// Nothing here reaches into the app. There is no test hook in it, no
// id added to a button, no module stubbed out. Every assertion is
// something visible on the page, so a passing run is the app working
// rather than the app being cooperative.
//
// What makes this different from the suites is the length of the
// chain. A click goes through the client library to a gateway, the
// gateway hands it to an isolate that was built out of blobs in an
// object store, the function imports a package off a registry, the
// package calls the same server's rest api with the browser's own
// token, and postgres decides what that person may see.

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, test } from '@playwright/test'

import { mint } from '../mint.mjs'

const here = dirname(fileURLToPath(import.meta.url))

// The url and the key the app itself is configured with, read from the
// same file, so a test cannot pass against a server the app is not
// talking to.
const env = Object.fromEntries(
  readFileSync(join(here, '..', 'app', '.env'), 'utf8')
    .split('\n')
    .filter((line) => line.includes('='))
    .map((line) => {
      const at = line.indexOf('=')
      return [line.slice(0, at).trim(), line.slice(at + 1).trim()]
    })
)
const API = env.REACT_APP_SUPABASE_URL
const ANON = env.REACT_APP_SUPABASE_DEFAULT_PUBLISHABLE_KEY

const PASSWORD = 'demo-password'

// A run leaves accounts behind, and the second run has to be able to
// make its own.
const suffix = Math.random().toString(36).slice(2, 10)
const address = (who) => `${who}-${suffix}@example.invalid`

// The account is made by an operator rather than by the browser, which
// is one step out of the app on purpose. A node serving projects out
// of a registry has no mail settings of its own yet, so a sign up in
// the browser ends at a confirmation nobody can send
// ([zou#488](https://github.com/tamnd/zou/issues/488)). Everything
// after this line is the browser's.
const SERVICE = mint(
  'service_role',
  process.env.ZOU_JWT_SECRET || 'super-secret-jwt-token-with-at-least-32-characters-long'
)

async function account(email) {
  const res = await fetch(`${API}/auth/v1/admin/users`, {
    method: 'POST',
    headers: {
      apikey: SERVICE,
      authorization: `Bearer ${SERVICE}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ email, password: PASSWORD, email_confirm: true }),
  })
  expect(res.status, await res.text().catch(() => '')).toBe(200)
}

async function signIn(page, email) {
  await page.goto('/')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill(PASSWORD)
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(page.getByRole('heading', { name: `Logged in as ${email}` })).toBeVisible()
}

async function signOut(page) {
  await page.getByRole('button', { name: 'Sign out' }).click()
  await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeVisible()
}

// The page invokes whatever the select says, with whatever the json
// editor holds, and prints the answer into the one `pre` on it.
async function invoke(page, name) {
  await page.locator('select').selectOption(name)
  await page.getByRole('button', { name: 'Invoke Function' }).click()
}

const answer = (page) => page.locator('pre')

test('the app is upstream s own, pointed at zou', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Supabase Egde Functions Test Client' })).toBeVisible()
  // The four names upstream ships, in upstream's order, which is the
  // check that this is the app rather than something written to pass.
  await expect(page.locator('select option')).toHaveText([
    'local: Whatever function is currently served by the CLI',
    'browser-with-cors',
    'select-from-table-with-auth-rls',
    'send-email-smtp',
  ])
})

test('a signed in person invokes a deployed function from the browser', async ({ page }) => {
  const email = address('hello')
  await account(email)
  await signIn(page, email)

  await invoke(page, 'browser-with-cors')
  // The body is the editor's own starting value, `{ name: 'world' }`,
  // so this sentence came back out of the function's own code.
  await expect(answer(page)).toContainText('Hello world!')
})

test('what the function sees is the person at the browser', async ({ page }) => {
  const email = address('claims')
  await account(email)
  await signIn(page, email)

  await invoke(page, 'select-from-table-with-auth-rls')
  // The function answers with the claims it verified and the rows it
  // was allowed, so both halves of the chain are on the page.
  await expect(answer(page)).toContainText(email)
})

test('two accounts select the same table through the same function and see one row each', async ({
  page,
}) => {
  const first = address('rls-a')
  const second = address('rls-b')

  await account(first)
  await account(second)

  await signIn(page, first)
  await signOut(page)
  await signIn(page, second)

  await invoke(page, 'select-from-table-with-auth-rls')
  await expect(answer(page)).toContainText(second)
  await expect(answer(page)).not.toContainText(first)

  await signOut(page)
  await signIn(page, first)
  await invoke(page, 'select-from-table-with-auth-rls')
  await expect(answer(page)).toContainText(first)
  await expect(answer(page)).not.toContainText(second)
})

test('an anon key is not a person, and the function says so', async ({ page }) => {
  const alerts = []
  page.on('dialog', async (dialog) => {
    alerts.push(dialog.message())
    await dialog.dismiss()
  })

  await page.goto('/')
  await invoke(page, 'browser-with-cors')

  // The app alerts whatever the client library handed it, which is an
  // error rather than a greeting, because the function asked for a
  // user and the browser is holding the project's anon key.
  await expect.poll(() => alerts.length).toBeGreaterThan(0)
  await expect(answer(page)).not.toContainText('Hello world!')
})

test('the browser preflights the invoke and the function answers it', async ({ page }) => {
  // A cross origin invoke carrying an authorization header is two
  // requests, and the first one is the one nobody looks at until it
  // fails. The app is on one origin and the api is on another,
  // deliberately, so this is the ordinary path rather than a case.
  //
  // The preflight is the browser's own and is not something a page can
  // send or read, so what is checked is the only thing that proves it
  // passed: the answer to the request behind it arrived and was
  // readable, which needs the headers on both.
  const email = address('cors')
  await account(email)
  await signIn(page, email)

  const invoked = await page.evaluate(async (api) => {
    const key = JSON.parse(
      localStorage.getItem(Object.keys(localStorage).find((at) => at.endsWith('-auth-token')))
    ).access_token
    try {
      const res = await fetch(`${api}/functions/v1/browser-with-cors`, {
        method: 'POST',
        headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
        body: JSON.stringify({ name: 'preflight' }),
      })
      return { status: res.status, body: await res.text() }
    } catch (error) {
      return { blocked: String(error) }
    }
  }, API)

  expect(invoked.blocked).toBeUndefined()
  expect(invoked.status).toBe(200)
  expect(invoked.body).toContain('Hello preflight!')
})
