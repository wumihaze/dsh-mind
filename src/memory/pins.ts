/**
 * Pinned (常驻) sticky-note management.
 *
 * A sidecar file (`~/.dsh/memory/pinned.json`) records which sticky-note entries
 * should be injected into every prompt. Pins are matched by entry TEXT (exact),
 * not index, so they survive reordering; entries whose text no longer exists
 * (edited/removed manually) are pruned on read.
 *
 * @module @wumihaze/dsh-mind/memory/pins
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

interface PinnedIndex {
  version: 1
  entries: string[]
}

function pinsPath(root: string): string {
  return join(root, 'memory', 'pinned.json')
}

/** Read the pinned entry texts, pruning any that no longer exist in `entries`. */
export function readPins(root: string, entries: string[]): string[] {
  const path = pinsPath(root)
  if (!existsSync(path)) return []
  try {
    const raw = JSON.parse(readFileSync(path, 'utf8')) as Partial<PinnedIndex>
    const known = new Set(entries)
    const list = (Array.isArray(raw.entries) ? raw.entries : []).filter((e): e is string => typeof e === 'string' && known.has(e))
    return [...new Set(list)]
  } catch {
    return []
  }
}

function writePins(root: string, pins: string[]): void {
  const path = pinsPath(root)
  const dir = dirname(path)
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  writeFileSync(path, JSON.stringify({ version: 1, entries: pins } satisfies PinnedIndex, null, 2) + '\n', 'utf8')
}

/** Toggle the pin on the entry at `idx` (0-based) in `entries`. */
export function togglePin(root: string, entries: string[], idx: number): { pinned: string[] } {
  if (!Number.isInteger(idx) || idx < 0 || idx >= entries.length) {
    throw new Error(`invalid index ${String(idx)}: must be 0..${entries.length - 1}`)
  }
  const text = entries[idx] as string // bounds checked above
  const pins = readPins(root, entries)
  const next = pins.includes(text) ? pins.filter((p) => p !== text) : [...pins, text]
  writePins(root, next)
  return { pinned: next }
}

/** Drop any pins for texts that were edited or removed. Call after a write. */
export function prunePins(root: string, entries: string[]): string[] {
  const pins = readPins(root, entries)
  writePins(root, pins)
  return pins
}
