// Resumable uploads, driven by the client Supabase tells people to use.
//
// Every other suite in this repository is a request and a recorded
// answer, or somebody else's test file run unedited. This one is
// neither, because there is nothing to copy: tus-js-client's own tests
// are about the client and storage-api's are about the server, and
// nobody upstream ships a suite that points the one at the other.
//
// So the questions here are ours and they are written the way the
// Supabase docs write a resumable upload, which is tus-js-client
// pointed at /storage/v1/upload/resumable with the token in a header
// and the destination in the metadata. The assertions are read back
// through supabase-js rather than through another raw request, because
// the claim being made is that an object uploaded this way is an
// ordinary object: the same client that would have called upload() can
// download it, list it, and see its size and its type.
//
// What that catches, and a recorded case cannot, is everything about
// the protocol that is a conversation rather than an answer. A client
// picks its own chunk boundaries, asks where it got to after an
// interruption, sends the offset it believes in, and gives up if the
// server contradicts it. None of that is visible one request at a time.

import { createClient } from '@supabase/supabase-js'
import * as tus from 'tus-js-client'
import { beforeAll, describe, expect, test } from 'vitest'

const URL = process.env.ZOU_URL ?? 'http://127.0.0.1:54321'
// The anon key the supabase CLI prints, signed with the CLI's own
// secret, so this file runs against a local stack unedited.
const ANON =
  process.env.ZOU_ANON_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0'

const ENDPOINT = `${URL}/storage/v1/upload/resumable`

const supabase = createClient(URL, ANON)

let token = ''

/// Where the interrupted upload got to, handed from the test that
/// interrupts one to the test that finishes it. Two clients and one
/// url is the whole point of the protocol, so the second one is told
/// nothing else.
let resumable = ''

beforeAll(async () => {
  const { data, error } = await supabase.auth.signInWithPassword({
    email: 'tus@zou.test',
    password: 'password123',
  })
  expect(error).toBeNull()
  token = data.session!.access_token
})

/// Bytes that are the same every run and different at every offset, so
/// a chunk delivered twice or in the wrong order is a mismatch rather
/// than a coincidence.
function pattern(size: number): Buffer {
  const bytes = Buffer.alloc(size)
  for (let i = 0; i < size; i++) bytes[i] = (i * 31 + (i >> 8)) & 0xff
  return bytes
}

type Options = {
  bucket?: string
  chunkSize?: number
  contentType?: string
  upsert?: boolean
  token?: string
  onChunk?: (upload: tus.Upload, offset: number) => void
}

/// One upload, the way the docs write one, resolved when tus-js-client
/// says it is done and rejected with the server's own words when it is
/// not.
function upload(name: string, body: Buffer, options: Options = {}): Promise<tus.Upload> {
  return new Promise((resolve, reject) => {
    const it = new tus.Upload(body, {
      endpoint: ENDPOINT,
      // No retries. A retry here would turn a refusal into a timeout
      // and hide which request was refused.
      retryDelays: [],
      headers: {
        authorization: `Bearer ${options.token ?? token}`,
        ...(options.upsert ? { 'x-upsert': 'true' } : {}),
      },
      uploadDataDuringCreation: true,
      removeFingerprintOnSuccess: true,
      metadata: {
        bucketName: options.bucket ?? 'tus',
        objectName: name,
        contentType: options.contentType ?? 'text/plain',
        cacheControl: '3600',
      },
      chunkSize: options.chunkSize ?? 6 * 1024 * 1024,
      onError: reject,
      onChunkComplete: (_size, offset) => options.onChunk?.(it, offset),
      onSuccess: () => resolve(it),
    })
    it.start()
  })
}

async function download(bucket: string, name: string): Promise<Buffer> {
  const { data, error } = await supabase.storage.from(bucket).download(name)
  expect(error).toBeNull()
  return Buffer.from(await data!.arrayBuffer())
}

describe('an upload that goes through in one piece', () => {
  test('arrives, and is an ordinary object afterwards', async () => {
    const body = pattern(4096)
    const it = await upload('hello.txt', body)

    // The client believes it is finished, and where it sent the bytes
    // is the url the creation handed back.
    expect(it.url).toMatch(/\/storage\/v1\/upload\/resumable\/[A-Za-z0-9+/=_-]+$/)

    expect(await download('tus', 'hello.txt')).toEqual(body)

    const { data, error } = await supabase.storage.from('tus').list('', { limit: 100 })
    expect(error).toBeNull()
    const there = data!.find((o) => o.name === 'hello.txt')
    expect(there).toBeTruthy()
    expect(there!.metadata!.size).toBe(body.length)
    expect(there!.metadata!.mimetype).toBe('text/plain')
  })

  test('carries the content type the metadata asked for', async () => {
    await upload('typed.json', Buffer.from('{"a":1}'), { contentType: 'application/json' })

    const { data } = await supabase.storage.from('tus').list('', { limit: 100 })
    const there = data!.find((o) => o.name === 'typed.json')
    expect(there!.metadata!.mimetype).toBe('application/json')
    // And cacheControl is dropped on the way, which is the one place a
    // resumable upload differs from the ordinary one. It is upstream's
    // behaviour, recorded rather than fixed, so a client that sets it
    // and reads it back sees no-cache here as it does there.
    expect(there!.metadata!.cacheControl).toBe('no-cache')
  })

  test('into a public bucket, readable by nobody in particular', async () => {
    const body = pattern(1024)
    await upload('open.bin', body, { bucket: 'tus-open', contentType: 'application/octet-stream' })

    const { data } = supabase.storage.from('tus-open').getPublicUrl('open.bin')
    const answer = await fetch(data.publicUrl)
    expect(answer.status).toBe(200)
    expect(Buffer.from(await answer.arrayBuffer())).toEqual(body)
  })
})

describe('an upload that takes several requests', () => {
  test('is reassembled in the order it was sent', async () => {
    const body = pattern(768 * 1024)
    const offsets: number[] = []
    await upload('big.bin', body, {
      chunkSize: 256 * 1024,
      contentType: 'application/octet-stream',
      onChunk: (_it, offset) => offsets.push(offset),
    })

    // Three requests carried it, and the offset the server reported
    // after each one is where the client thought it was.
    expect(offsets).toEqual([262144, 524288, 786432])
    expect(await download('tus', 'big.bin')).toEqual(body)
  })

  test('is not an object until the last byte lands', async () => {
    const body = pattern(512 * 1024)
    let half: tus.Upload | undefined

    await new Promise<void>((resolve, reject) => {
      const it = new tus.Upload(body, {
        endpoint: ENDPOINT,
        retryDelays: [],
        headers: { authorization: `Bearer ${token}` },
        uploadDataDuringCreation: true,
        metadata: { bucketName: 'tus', objectName: 'halfway.bin' },
        chunkSize: 128 * 1024,
        onError: reject,
        onChunkComplete: (_size, offset) => {
          if (offset >= 256 * 1024) {
            half = it
            it.abort().then(resolve, reject)
          }
        },
        onSuccess: () => reject(new Error('it finished, so nothing was interrupted')),
      })
      it.start()
    })

    const { data } = await supabase.storage.from('tus').list('', { limit: 100 })
    expect(data!.find((o) => o.name === 'halfway.bin')).toBeUndefined()

    const { error } = await supabase.storage.from('tus').download('halfway.bin')
    expect(error).toBeTruthy()

    // And the half that did arrive is still there to be finished,
    // which is the next test.
    expect(half!.url).toBeTruthy()
    resumable = half!.url!
  })
})

describe('an upload that was interrupted', () => {
  test('picks up from the offset the server reports', async () => {
    const body = pattern(512 * 1024)
    expect(resumable).toBeTruthy()

    const sent: number[] = []
    await new Promise<void>((resolve, reject) => {
      const it = new tus.Upload(body, {
        endpoint: ENDPOINT,
        uploadUrl: resumable,
        retryDelays: [],
        headers: { authorization: `Bearer ${token}` },
        metadata: { bucketName: 'tus', objectName: 'halfway.bin' },
        chunkSize: 128 * 1024,
        onError: reject,
        onChunkComplete: (_size, offset) => sent.push(offset),
        onSuccess: () => resolve(),
      })
      it.start()
    })

    // A second process, a new client, and the only thing it was told is
    // the url. It asked where the last one got to, was told 262144, and
    // sent the two chunks that were left.
    expect(sent).toEqual([393216, 524288])
    expect(await download('tus', 'halfway.bin')).toEqual(body)
  })

  test('is gone once it has been terminated', async () => {
    const body = pattern(256 * 1024)
    let url = ''

    await new Promise<void>((resolve, reject) => {
      const it = new tus.Upload(body, {
        endpoint: ENDPOINT,
        retryDelays: [],
        headers: { authorization: `Bearer ${token}` },
        uploadDataDuringCreation: true,
        metadata: { bucketName: 'tus', objectName: 'abandoned.bin' },
        chunkSize: 64 * 1024,
        onError: reject,
        onChunkComplete: (_size, offset) => {
          if (offset >= 128 * 1024) {
            url = it.url!
            it.abort().then(resolve, reject)
          }
        },
        onSuccess: () => reject(new Error('it finished, so nothing was interrupted')),
      })
      it.start()
    })

    const gone = await fetch(url, {
      method: 'DELETE',
      headers: { authorization: `Bearer ${token}`, 'tus-resumable': '1.0.0' },
    })
    expect(gone.status).toBe(204)

    const asked = await fetch(url, {
      method: 'HEAD',
      headers: { authorization: `Bearer ${token}`, 'tus-resumable': '1.0.0' },
    })
    expect(asked.status).toBe(404)
  })
})

describe('what the endpoint says about itself', () => {
  test('an options answers with the protocol it speaks', async () => {
    const said = await fetch(ENDPOINT, {
      method: 'OPTIONS',
      headers: { authorization: `Bearer ${token}` },
    })

    expect(said.status).toBe(204)
    expect(said.headers.get('tus-resumable')).toBe('1.0.0')
    expect(said.headers.get('tus-version')).toBe('1.0.0')
    expect(said.headers.get('tus-extension')).toBe(
      'creation,creation-with-upload,creation-defer-length,termination,expiration'
    )
    expect(said.headers.get('tus-max-size')).toBe('52428800000')
  })
})

describe('what it refuses', () => {
  test('an upload with no token at all', async () => {
    await expect(upload('nope.txt', pattern(16), { token: 'not-a-token' })).rejects.toThrow()

    const { data } = await supabase.storage.from('tus').list('', { limit: 100 })
    expect(data!.find((o) => o.name === 'nope.txt')).toBeUndefined()
  })

  test('a second upload to a name that is taken, unless it says upsert', async () => {
    const first = pattern(2048)
    await upload('twice.txt', first)

    const second = pattern(4096)
    await expect(upload('twice.txt', second)).rejects.toThrow()
    expect(await download('tus', 'twice.txt')).toEqual(first)

    await upload('twice.txt', second, { upsert: true })
    expect(await download('tus', 'twice.txt')).toEqual(second)
  })

  test('more bytes than the bucket takes', async () => {
    // The bucket's ceiling is 10 MB and the endpoint announces 52 GB,
    // so this is the bucket answering rather than the protocol.
    await expect(upload('toobig.bin', pattern(11 * 1024 * 1024), { chunkSize: 4 * 1024 * 1024 }))
      .rejects.toThrow()

    const { data } = await supabase.storage.from('tus').list('', { limit: 100 })
    expect(data!.find((o) => o.name === 'toobig.bin')).toBeUndefined()
  })

  test('a bucket that is not there', async () => {
    await expect(upload('somewhere.txt', pattern(16), { bucket: 'nowhere' })).rejects.toThrow()
  })
})
