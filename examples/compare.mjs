// Read the recording, and say what it adds up to.
//
// With a probe tsv as well, say where a fresh run differs from what was
// written down. A status that moved is either zou getting further or a
// library on the network changing under both of us, and either way it
// is a line somebody should read rather than a test somebody should
// have failed.
//
//   node compare.mjs                       the arithmetic
//   node compare.mjs /tmp/exproj/probe.tsv what changed since
//   node compare.mjs /tmp/probe.tsv reference   the same, for the other server
import { readFileSync } from 'node:fs'

const doc = JSON.parse(readFileSync(new URL('./measured.json', import.meta.url), 'utf8'))
const [tsv, side = 'zou'] = process.argv.slice(2)

const of = (verdict) => doc.functions.filter((f) => f.verdict === verdict).map((f) => f.name)
const asked = doc.functions.length
const ran = (which) => doc.functions.filter((f) => f[which].ran).length

console.log(`corpus  ${doc.corpus.repository} ${doc.corpus.commit.slice(0, 7)}, measured ${doc.measured_on}`)
console.log(`asked   ${asked}`)
console.log(`zou     ${ran('zou')}`)
console.log(`upstream ${ran('reference')}`)
console.log(`agree   ${of('both').length}`)
for (const verdict of ['zou only', 'reference only', 'neither']) {
  const names = of(verdict)
  console.log(`\n${verdict} (${names.length})`)
  for (const name of names) {
    const f = doc.functions.find((x) => x.name === name)
    const which = verdict === 'reference only' ? 'zou' : verdict === 'zou only' ? 'reference' : 'zou'
    console.log(`  ${name}: ${f[which].log ?? f[which].body}`)
  }
}

if (!tsv) process.exit(0)

const fresh = new Map()
for (const line of readFileSync(tsv, 'utf8').split('\n')) {
  if (!line.trim()) continue
  const [name, status, , body = ''] = line.split('\t')
  fresh.set(name, { status: Number(status), body: body.trim() })
}

console.log(`\nagainst ${tsv}, as ${side}`)
let moved = 0
for (const f of doc.functions) {
  const now = fresh.get(f.name)
  if (!now) {
    console.log(`  ${f.name}: gone, was ${f[side].status}`)
    moved++
    continue
  }
  if (now.status !== f[side].status) {
    console.log(`  ${f.name}: ${f[side].status} then, ${now.status} now`)
    moved++
  }
}
for (const name of fresh.keys()) {
  if (!doc.functions.some((f) => f.name === name)) {
    console.log(`  ${name}: new, ${fresh.get(name).status}`)
    moved++
  }
}
console.log(moved ? `${moved} moved` : 'nothing moved')
