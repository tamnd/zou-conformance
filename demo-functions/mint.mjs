// Sign a project key for a role, out of the project's own secret.
//
// A project key is an HS256 token with a `role` claim, which is the
// same string that goes in an `apikey` header and the same string the
// postgres port takes as a password. `zou tenant keys` prints the two
// a client uses. This mints the third one, `postgres`, which is what a
// migration is applied as, and it is here rather than in the server
// because the credential is the project secret and whoever has that
// can already do this.
//
//   node mint.mjs postgres <secret>
import { createHmac } from 'node:crypto'
import { pathToFileURL } from 'node:url'

const b64 = (value) => Buffer.from(JSON.stringify(value)).toString('base64url')

export function mint(role, secret) {
  const now = Math.floor(Date.now() / 1000)
  const head = b64({ alg: 'HS256', typ: 'JWT' })
  const body = b64({ iss: 'zou', role, iat: now, exp: now + 3600 })
  const signature = createHmac('sha256', secret).update(`${head}.${body}`).digest('base64url')
  return `${head}.${body}.${signature}`
}

// Nothing runs when this is imported, so the tests can mint a key of
// their own without going through a shell.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [role, secret] = process.argv.slice(2)
  if (!role || !secret) {
    console.error('usage: node mint.mjs <role> <secret>')
    process.exit(2)
  }
  console.log(mint(role, secret))
}
