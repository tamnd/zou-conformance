// What every file here needs: where to ask, what to ask with, and
// which of the two servers is answering.
//
// The url and the key are the local stack's defaults, because the point
// of this suite is a project that has changed nothing. A run against
// zou sets both.

import { createHmac } from 'node:crypto'

export const SUPABASE_URL = process.env.ZOU_URL ?? 'http://127.0.0.1:54321'

export const ANON_KEY =
  process.env.ZOU_ANON_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0'

// Whether the thing answering is the local stack rather than zou.
//
// Three questions here have two right answers, and both of them are
// written down in the zou repository as measured divergences rather
// than as things to fix. A suite that skipped them would be a suite
// that stopped noticing the day one of the two changed, so they are
// asked of both and each is asserted against what that server does.
export const REFERENCE = process.env.ZOU_REFERENCE === '1'

export const NAME = REFERENCE ? 'supabase start' : 'zou'

export function at(name: string, tail = ''): string {
  return `${SUPABASE_URL}/functions/v1/${name}${tail}`
}

export function keyed(extra: Record<string, string> = {}): Record<string, string> {
  return { Authorization: `Bearer ${ANON_KEY}`, apikey: ANON_KEY, ...extra }
}

// A token that is shaped like one and is not this project's, for the
// refusal that is about the signature rather than about the shape. The
// secret is deliberately not the server's, and no library is used to
// mint it: three base64url segments is the whole format.
export function signedWithSomethingElse(): string {
  const head = segment({ alg: 'HS256', typ: 'JWT' })
  const claims = segment({
    iss: 'somebody-else',
    role: 'anon',
    exp: Math.floor(Date.now() / 1000) + 3600,
  })
  const signature = createHmac('sha256', 'a secret this project never had')
    .update(`${head}.${claims}`)
    .digest('base64url')
  return `${head}.${claims}.${signature}`
}

function segment(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString('base64url')
}

export async function invoke(
  name: string,
  init: RequestInit & { tail?: string } = {},
): Promise<Response> {
  const { tail, headers, ...rest } = init
  return await fetch(at(name, tail ?? ''), {
    ...rest,
    headers: keyed((headers ?? {}) as Record<string, string>),
  })
}

export async function json(name: string, init: RequestInit & { tail?: string } = {}) {
  const res = await invoke(name, init)
  const body = await res.text()
  if (!res.ok) {
    throw new Error(`${name} answered ${res.status}: ${body}`)
  }
  try {
    return JSON.parse(body)
  } catch {
    throw new Error(`${name} answered ${res.status} with something that is not json: ${body}`)
  }
}
