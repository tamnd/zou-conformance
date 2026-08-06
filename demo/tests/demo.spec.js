// The demo app, driven the way a person drives it.
//
// Nothing here reaches into the app. There is no test hook in it, no
// id added to a button, no module stubbed out. Every assertion is
// something visible on the page or something a second client can ask
// the api, so a passing run is the app working rather than the app
// being cooperative.

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, test } from '@playwright/test'

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
const API = env.VITE_SUPABASE_URL
const ANON = env.VITE_SUPABASE_PUBLISHABLE_KEY

const PASSWORD = 'demo-password'

// A run leaves accounts behind, and the second run has to be able to
// sign up too.
const suffix = Math.random().toString(36).slice(2, 10)
const address = (who) => `${who}-${suffix}@example.invalid`

async function signUp(page, email) {
  await page.goto('/')
  await page.getByLabel('Email:').fill(email)
  await page.getByLabel('Password:').fill(PASSWORD)
  await page.getByRole('button', { name: 'Sign Up' }).click()
  await expect(page.getByRole('heading', { name: 'Todo List.' })).toBeVisible()
}

async function signIn(page, email) {
  await page.goto('/')
  await page.getByLabel('Email:').fill(email)
  await page.getByLabel('Password:').fill(PASSWORD)
  await page.getByRole('button', { name: 'Sign In' }).click()
  await expect(page.getByRole('heading', { name: 'Todo List.' })).toBeVisible()
}

async function signOut(page) {
  await page.getByRole('button', { name: 'Logout' }).click()
  await expect(page.getByRole('button', { name: 'Sign In' })).toBeVisible()
}

async function add(page, task) {
  await page.getByPlaceholder('make coffee').fill(task)
  await page.getByRole('button', { name: 'Add' }).click()
  await expect(page.getByText(task)).toBeVisible()
}

test('signing up gets an account, a session and an empty list', async ({ page }) => {
  await signUp(page, address('first'))
  await expect(page.locator('li')).toHaveCount(0)

  await add(page, 'water the plants')
  // Reloaded rather than trusted: the row went to the server and came
  // back, instead of only ever having been in the page.
  await page.reload()
  await expect(page.getByText('water the plants')).toBeVisible()
})

test('one account cannot see another account s todos', async ({ page }) => {
  const first = address('rls-a')
  const second = address('rls-b')

  await signUp(page, first)
  await add(page, 'only mine')
  await signOut(page)

  await signUp(page, second)
  await expect(page.getByText('only mine')).toHaveCount(0)
  await add(page, 'only theirs')
  await expect(page.locator('li')).toHaveCount(1)
  await signOut(page)

  await signIn(page, first)
  await expect(page.getByText('only mine')).toBeVisible()
  await expect(page.getByText('only theirs')).toHaveCount(0)
})

test('the anon key on its own reads nobody s todos', async ({ page, request }) => {
  await signUp(page, address('anon-check'))
  await add(page, 'not for the world')

  // The key the app ships to the browser, with no session behind it,
  // which is what an attacker has. The policy is the only thing
  // between it and the table.
  const answer = await request.get(`${API}/rest/v1/todos?select=task`, {
    headers: { apikey: ANON, authorization: `Bearer ${ANON}` },
  })
  expect(answer.status()).toBe(200)
  expect(await answer.json()).toEqual([])
})

test('signing in with github lands on the same account twice', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'GitHub' }).click()
  await expect(page.getByRole('heading', { name: 'Todo List.' })).toBeVisible()

  // The identity is keyed by the provider's id for somebody, not by
  // the address, so a second sign in is the same account and not a
  // second one that looks like it.
  const task = `from github ${suffix}`
  await add(page, task)
  await signOut(page)

  await page.getByRole('button', { name: 'GitHub' }).click()
  await expect(page.getByText(task)).toBeVisible()
})
