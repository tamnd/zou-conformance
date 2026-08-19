// The chat demo, driven the way two people drive it.
//
// Every test here has two browsers in it, because that is the claim:
// something one person does shows up on somebody else's screen without
// anybody asking for it again. A suite can ask a server for a frame and
// compare it with a recording. This asks whether an application built
// on those frames updates.
//
// Nothing reaches into the app. There is no test hook in it, no id
// added to a button, no module stubbed out. Every assertion is either
// something visible on a page or something the second browser is not
// allowed to see.

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
const API = env.NEXT_PUBLIC_SUPABASE_URL.replace(/\/$/, '')
const ANON = env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY

const PASSWORD = 'demo-password'

// A run leaves accounts and rows behind, and the next run has to be
// able to sign up and to tell its own messages apart from the ones the
// last run left in the channel.
const suffix = Math.random().toString(36).slice(2, 10)
const address = (who) => `${who}-${suffix}@example.invalid`
const said = (what) => `${what} ${suffix}`

// The seeded project the app's own migrations build: two channels, and
// one message in each of them.
const PUBLIC_CHANNEL = '/channels/1'
const SEEDED = 'Hello World 👋'

async function signUp(page, email) {
  await page.goto('/')
  await page.getByPlaceholder('Your Username').fill(email)
  await page.getByPlaceholder('Your password').fill(PASSWORD)
  await page.getByRole('link', { name: 'Sign up' }).click()
  // The app sends a session to the public channel, so arriving there
  // is the sign up having worked.
  await expect(page.getByRole('button', { name: 'New Channel' })).toBeVisible()
  await expect(page).toHaveURL(new RegExp(`${PUBLIC_CHANNEL}$`))
  // And the seeded message, because arriving is not the same as being
  // loaded. The app asks for the room's messages when the route
  // changes and puts what comes back on the screen in place of what is
  // there, so anything sent before that answer lands is drawn and then
  // wiped by it. The seed on the screen is the answer having landed.
  await expect(page.getByText(SEEDED)).toBeVisible()
}

// Into a room that has nothing in it yet, where there is nothing to
// wait for on the screen, so the answer itself is what is waited on.
async function walkInto(page, link) {
  const loaded = page.waitForResponse(
    (response) =>
      response.request().method() === 'GET' && response.url().includes('/rest/v1/messages?select=')
  )
  await link.click()
  await loaded
}

// A browser of somebody s own: its own storage, so its own session.
async function person(browser, email) {
  const context = await browser.newContext()
  const page = await context.newPage()
  await signUp(page, email)
  await stamp(page)
  return { context, page }
}

// A mark on the window, which a reload would wipe. Nothing in the app
// reads it. It is here so that "without a reload" is an assertion
// rather than a claim about what the test does not do.
const stamp = (page) => page.evaluate(() => (window.__stillTheSamePage = true))
const stillTheSamePage = (page) => page.evaluate(() => window.__stillTheSamePage === true)

async function send(page, text) {
  await page.getByPlaceholder('Send a message').fill(text)
  await page.getByPlaceholder('Send a message').press('Enter')
  await expect(page.getByText(text)).toBeVisible()
}

// The trash button beside one message, which the app only renders for
// somebody allowed to delete it.
const bin = (page, text) =>
  page.getByText(text, { exact: true }).locator('xpath=../..').getByRole('button')

test('a message one person sends arrives on the other person s screen', async ({ browser }) => {
  const first = await person(browser, address('says'))
  const second = await person(browser, address('hears'))

  // The seed is read back through the api with its author embedded, so
  // the page starts out as the project rather than as nothing.
  await expect(second.page.getByText('supabot+supaadmin@example.com')).toBeVisible()

  const message = said('the fan out works')
  await send(first.page, message)

  await expect(second.page.getByText(message)).toBeVisible()
  expect(await stillTheSamePage(second.page)).toBe(true)

  // And it is a row rather than something the page drew: read back on
  // a page that starts again, with the author it was written by.
  await second.page.reload()
  await expect(second.page.getByText(message)).toBeVisible()
  await expect(second.page.getByText(address('says'))).toBeVisible()

  await first.context.close()
  await second.context.close()
})

test('a message taken back disappears from the other screen too', async ({ browser }) => {
  const first = await person(browser, address('deletes'))
  const second = await person(browser, address('watches'))

  const message = said('this one is going away')
  await send(first.page, message)
  await expect(second.page.getByText(message)).toBeVisible()

  // A delete on a table with replica identity full publishes the whole
  // old row, and what a subscriber is sent of it is cut to the key.
  await bin(first.page, message).click()
  await expect(second.page.getByText(message)).toHaveCount(0)
  expect(await stillTheSamePage(second.page)).toBe(true)

  await first.context.close()
  await second.context.close()
})

test('a channel somebody makes appears in the other person s sidebar', async ({ browser }) => {
  const first = await person(browser, address('opens'))
  const second = await person(browser, address('follows'))

  const slug = `room-${suffix}`
  first.page.once('dialog', (dialog) => dialog.accept(slug))
  await first.page.getByRole('button', { name: 'New Channel' }).click()

  const arrived = second.page.getByRole('link', { name: slug })
  await expect(arrived).toBeVisible()
  expect(await stillTheSamePage(second.page)).toBe(true)

  // And it is a channel rather than a name in a list: the second
  // person walks into it and sends the first message in it.
  await walkInto(second.page, arrived)
  const message = said('first one in here')
  await send(second.page, message)
  await expect(first.page.getByText(message)).toHaveCount(0)
  await walkInto(first.page, first.page.getByRole('link', { name: slug }))
  await expect(first.page.getByText(message)).toBeVisible()

  await first.context.close()
  await second.context.close()
})

test('the key in the bundle hears nothing it may not read', async ({ browser, request }) => {
  const first = await person(browser, address('writes'))
  const second = await person(browser, address('reads'))

  // A third browser with no session, on the same channel, holding the
  // key every visitor holds because it is in the javascript. It
  // subscribes to the same three tables the other two do.
  const outside = await browser.newContext()
  const anon = await outside.newPage()
  await anon.goto(PUBLIC_CHANNEL)
  await expect(anon.getByRole('button', { name: 'New Channel' })).toBeVisible()
  await expect(anon.getByText('Hello World 👋')).toHaveCount(0)

  const message = said('members only')
  await send(first.page, message)
  // Waited for on the screen of somebody who may read it, so that the
  // absence below is a row that went out and was not sent here rather
  // than a row that has not been written yet.
  await expect(second.page.getByText(message)).toBeVisible()
  await expect(anon.getByText(message)).toHaveCount(0)

  // And the same question asked of the api directly, since a socket
  // that sends nothing and a page that renders nothing are two
  // different failures.
  const answer = await request.get(`${API}/rest/v1/messages?select=message`, {
    headers: { apikey: ANON, authorization: `Bearer ${ANON}` },
  })
  expect(answer.status()).toBe(200)
  expect(await answer.json()).toEqual([])

  await outside.close()
  await first.context.close()
  await second.context.close()
})

test('an admin can take back a message that is not theirs', async ({ browser }) => {
  // The project's own rule for who is an admin, in the trigger its own
  // migration installs, and the claim that carries it is minted by the
  // project's own postgres function at sign in.
  const admin = await person(browser, `admin-${suffix}+supaadmin@example.invalid`)
  const member = await person(browser, address('member'))

  const message = said('somebody else wrote this')
  await send(member.page, message)
  await expect(admin.page.getByText(message)).toBeVisible()

  await bin(admin.page, message).click()
  await expect(member.page.getByText(message)).toHaveCount(0)

  await admin.context.close()
  await member.context.close()
})
