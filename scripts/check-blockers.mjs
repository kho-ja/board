#!/usr/bin/env node
/**
 * One-shot "is anything blocking the next milestone?" checker.
 *
 * Reads the canonical plan (docs/START_PLAN.md) and the other docs, then prints:
 *   - the ordered milestone list (M0..M18) with any done-markers found
 *   - the next milestone to implement (first not marked done)
 *   - any explicit blocker/blocked/BLOCK markers in docs/
 *   - the verification checklist to run for the next milestone
 *
 * Exit code: 0 = no blockers found, 1 = a blocker marker was found (or the
 * next milestone could not be determined).
 */
import { readFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const docsDir = join(root, 'docs')

function read(name) {
  const p = join(docsDir, name)
  return existsSync(p) ? readFileSync(p, 'utf8') : ''
}

const plan = read('START_PLAN.md')
if (!plan) {
  console.error('docs/START_PLAN.md not found – run from the repo root.')
  process.exit(1)
}

// Ordered milestone descriptors: number/name as written in START_PLAN.md §2.
const milestoneRe = /^###\s+(M\d+)\s+[—\-–]\s+(.+)$/gm
const milestones = []
let m
while ((m = milestoneRe.exec(plan)) !== null) {
  milestones.push({ id: m[1], title: m[2].trim() })
}

// How "done" is recorded in docs/ARCHITECTURE.md status line + per-milestone notes.
const architecture = read('ARCHITECTURE.md')
const doneIndicators = /implemented|complete|completed|done|verified|in place|shipped/i

// Mark a milestone done if the current architecture status reports it, or the
// docs contain a "M<n> ... complete/implemented" phrase.
const done = new Set()
for (const ms of milestones) {
  const archHas = architecture.includes(`M${ms.id.replace('M', '')}`)
  const phraseInPlan = new RegExp(
    `${ms.id}[\\s\\S]{0,120}?(complete|implemented|done|verified)`,
    'i',
  )
  // Blanket header-level status in ARCHITECTURE, e.g. "Status: M0–M18 complete",
  // covers a contiguous range of milestones.
  if (/Status:[\s\S]*M\d+/.test(architecture)) {
    const blanket = architecture.match(/M(\d+)[—–-]?\s*M(\d+)\s+(?:implemented|complete)/i)
    if (blanket) {
      const lo = parseInt(blanket[1], 10)
      const hi = parseInt(blanket[2], 10)
      const n = parseInt(ms.id.slice(1), 10)
      if (n >= lo && n <= hi) {
        done.add(ms.id)
        continue
      }
    }
  }
  if (archHas && doneIndicators.test(architecture)) done.add(ms.id)
  if (phraseInPlan.test(plan)) done.add(ms.id)
}

const next = milestones.find((x) => !done.has(x.id))

// Collect explicit blocker markers anywhere in docs/ (only clear, still-open
// markers; "not blocked"/"no blocker" are recorded as resolutions and skipped).
const blockerFile = ['START_PLAN.md', 'BUILD_QUESTIONS.md', 'ROADMAP.md', 'DEVELOPMENT.md']
const blockers = []
for (const f of blockerFile) {
  const text = read(f)
  if (!text) continue
  const re = /.*\b(?:BLOCKER:|\bBLOCKED(?:\s*[:=])?|currently blocked|blocked by|is blocked|has a blocker|blocking (?:milestone|M\d+)|cannot proceed until|no longer a blocker)\b.*$/gim
  let line
  while ((line = re.exec(text)) !== null) {
    const t = line[0].trim()
    if (/\bnot blocked\b|\bno blocker\b|\bblocked\??(?:=|:) no\b|\bno longer a blocker\b/i.test(t)) continue
    blockers.push({ file: f, line: t.slice(0, 160) })
  }
}

console.log('─ kho-ja blocker check ───────────────────────────────')
console.log('Milestones (docs/START_PLAN.md §2):')
for (const ms of milestones) {
  const flag = done.has(ms.id) ? '✓ done' : '○' + (ms.id === next?.id ? ' NEXT' : '')
  console.log(`  ${ms.id.padEnd(4)} ${flag.padEnd(10)} ${ms.title}`)
}

if (next) {
  console.log('')
  console.log(`Next milestone to implement: ${next.id} — ${next.title}`)
} else {
  console.log('')
  console.log('All milestones appear done.')
}

if (blockers.length) {
  console.log('')
  console.log(`Blocker markers found (${blockers.length}):`)
  for (const b of blockers) console.log(`  ${b.file}: ${b.line}`)
  process.exitCode = 1
} else {
  console.log('')
  console.log('No explicit blocker markers found in docs/.')
}

console.log('')
console.log('Suggested next steps:')
console.log('  1. `npm run dev`  → open http://localhost:3000/')
console.log('  2. `npx tsc --noEmit` && `npm run lint` && `npm run build`')
console.log(
  '  3. Confirm Postgres up (DATABASE_URL in .env.local) and `npm run db:push` reflects schema',
)
