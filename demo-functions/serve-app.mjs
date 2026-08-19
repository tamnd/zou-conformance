// Serve the app's build directory, and nothing else.
//
// Create React App's own server is a development server, and what a
// project deploys is the build. `npx serve` would do this too, at the
// cost of a package fetched at test time for forty lines of code that
// cannot change under the run.
//
// Every path that is not a file is index.html, because the app is one
// page and a reload of a route it invented has to reach it.
import { createReadStream, existsSync, statSync } from 'node:fs'
import { createServer } from 'node:http'
import { extname, join, normalize } from 'node:path'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, 'app', 'build')
const port = Number(process.env.DEMO_APP_PORT || 4174)

const TYPES = {
  '.css': 'text/css',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.js': 'text/javascript',
  '.json': 'application/json',
  '.map': 'application/json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8',
}

const file = (url) => {
  // A path is a path under the build directory or it is nothing. The
  // normalize is what keeps `..` out rather than a check somewhere
  // that has to be remembered.
  const asked = join(root, normalize(decodeURIComponent(new URL(url, 'http://x').pathname)))
  if (!asked.startsWith(root)) return null
  if (existsSync(asked) && statSync(asked).isFile()) return asked
  return join(root, 'index.html')
}

createServer((req, res) => {
  const path = file(req.url)
  if (!path || !existsSync(path)) {
    res.writeHead(404, { 'content-type': 'text/plain' })
    res.end('not here\n')
    return
  }
  res.writeHead(200, { 'content-type': TYPES[extname(path)] || 'application/octet-stream' })
  createReadStream(path).pipe(res)
}).listen(port, '127.0.0.1', () => console.log(`app on http://127.0.0.1:${port}`))
