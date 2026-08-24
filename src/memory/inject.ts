/**
 * `memory-inject`: inject the user's pinned (常驻) sticky notes into the prompt.
 *
 * Host-plane. Registers a `mind:pinned-memory` prompt section whose text is a
 * function, so it is re-read on every assembly. If nothing is pinned the
 * section renders empty and is dropped — zero overhead until the user pins
 * entries. Pinned notes are short by design (the sticky-note budget is 2200
 * chars), so the injected text stays small.
 *
 * This is what makes key facts "always present" without the agent having to
 * call the `memory` tool — the hybrid of always-relevant + searchable.
 *
 * @module @wumihaze/dsh-mind/memory/inject
 */

import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import { dshHomePath } from '@deepseek-ai/dsh-home-paths'

/** Plugin name for the Loader manifest. */
export const name = 'memory-inject'
/** Services this plugin requires at mount time. */
export const inject = ['systemPrompt']

/** Prompt section name. */
export const PINNED_SECTION = 'mind:pinned-memory'

/**
 * Plugin config.
 * @public
 */
export interface Config {
  /** Master switch (default `true`; harmless because empty pins inject nothing). */
  enabled?: boolean
  /** Override dsh home (memory file lives at `<root>/memory/MEMORY.md`). */
  memoryRoot?: string
  /** Hard cap on the injected text (default `600` chars). */
  maxChars?: number
}

function memoryFile(root: string): string {
  return join(root, 'memory', 'MEMORY.md')
}

function pinsFile(root: string): string {
  return join(root, 'memory', 'pinned.json')
}

/** Read the pinned entry texts that still exist in MEMORY.md. */
function readPinnedTexts(root: string): string[] {
  const mem = memoryFile(root)
  if (!existsSync(mem)) return []
  let entries: string[] = []
  try {
    entries = readFileSync(mem, 'utf8')
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.startsWith('- '))
      .map((l) => l.slice(2))
  } catch {
    return []
  }
  const pinsPath = pinsFile(root)
  if (!existsSync(pinsPath)) return []
  try {
    const raw = JSON.parse(readFileSync(pinsPath, 'utf8')) as { entries?: unknown }
    const list = Array.isArray(raw.entries) ? raw.entries.filter((e): e is string => typeof e === 'string') : []
    const known = new Set(entries)
    return [...new Set(list.filter((e) => known.has(e)))]
  } catch {
    return []
  }
}

/**
 * Install the pinned-memory prompt section.
 * @param ctx - Cordis context carrying the systemPrompt service.
 * @param config - resolved plugin config.
 */
export function apply(ctx: Context, config: Config): void {
  if (config.enabled === false) return
  const root = config.memoryRoot ?? dshHomePath()
  const maxChars = config.maxChars ?? 600

  ctx.effect(() => ctx.systemPrompt.section({
    name: PINNED_SECTION,
    order: 20, // right after the persona, before tool guidance
    text: (): string => {
      const pinned = readPinnedTexts(root)
      if (pinned.length === 0) return ''
      let body = pinned.map((p) => `- ${p}`).join('\n')
      if (body.length > maxChars) body = `${body.slice(0, maxChars)}…`
      return `Pinned memory (always relevant, remember these):\n${body}`
    },
  }), 'memory-inject.section()')
}
