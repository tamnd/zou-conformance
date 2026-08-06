// A GitHub Enterprise install that is not one.
//
// The demo app's GitHub button cannot be clicked in a test against
// github.com: there is no account to sign in as, no browser session to
// reuse, and nothing that would still work in six months. What the
// button needs on the other end is four endpoints, and GoTrue and zou
// both let a project say where the github provider lives, because that
// is how an Enterprise install is reached. So this stands there.
//
// It authorizes whoever asks, without a consent screen, which is the
// one thing a real provider does that this does not. Everything the
// server under test does with the answer is the real path: the code is
// exchanged over http, the profile and the address are read from two
// documents in github's own shapes, and the account and the identity
// are made from what they say.

import { createServer } from 'node:http'

const port = Number(process.env.PORT || 54399)

// Who the person signing in turns out to be. The address is what the
// account ends up with, since github keeps it away from the profile
// document and in a list of its own.
const account = {
  id: 4242,
  login: 'octocat',
  name: 'Mona the Octocat',
  avatar_url: 'https://example.invalid/octocat.png',
  email: 'octocat@example.invalid',
}

// The codes handed out, so a code cannot be spent twice and a code
// nobody was given is not a sign in.
const codes = new Set()

function json(res, status, body) {
  const text = JSON.stringify(body)
  res.writeHead(status, {
    'content-type': 'application/json',
    'content-length': Buffer.byteLength(text),
  })
  res.end(text)
}

const server = createServer((req, res) => {
  const url = new URL(req.url, `http://127.0.0.1:${port}`)
  const path = url.pathname

  // The consent screen, without the consent. A real one would show the
  // scopes and wait for a click.
  if (path === '/login/oauth/authorize') {
    const back = url.searchParams.get('redirect_uri')
    const state = url.searchParams.get('state')
    if (!back || !state) {
      return json(res, 400, { error: 'invalid_request' })
    }
    const code = `code-${codes.size + 1}-${state.slice(0, 8)}`
    codes.add(code)
    const target = new URL(back)
    target.searchParams.set('code', code)
    target.searchParams.set('state', state)
    res.writeHead(302, { location: target.toString() })
    return res.end()
  }

  if (path === '/login/oauth/access_token' && req.method === 'POST') {
    let body = ''
    req.on('data', (chunk) => {
      body += chunk
    })
    req.on('end', () => {
      const form = new URLSearchParams(body)
      // github answers 200 with an error field rather than a status,
      // and a client that reads the status alone is a client that signs
      // somebody in on a refusal.
      if (!codes.delete(form.get('code'))) {
        return json(res, 200, {
          error: 'bad_verification_code',
          error_description: 'The code passed is incorrect or expired.',
        })
      }
      json(res, 200, {
        access_token: 'gho_stub_access_token',
        token_type: 'bearer',
        scope: 'user:email',
      })
    })
    return
  }

  if (path === '/api/v3/user') {
    return json(res, 200, {
      id: account.id,
      login: account.login,
      name: account.name,
      avatar_url: account.avatar_url,
      // Null on nearly every real account, which is the whole reason
      // there is a second call.
      email: null,
    })
  }

  if (path === '/api/v3/user/emails') {
    return json(res, 200, [
      { email: `secondary+${account.login}@example.invalid`, primary: false, verified: true },
      { email: account.email, primary: true, verified: true },
    ])
  }

  json(res, 404, { message: 'Not Found' })
})

server.listen(port, '127.0.0.1', () => {
  console.log(`stub github on http://127.0.0.1:${port}`)
})
