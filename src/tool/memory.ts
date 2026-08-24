/**
 * `memory` tool: list, search, add, replace, or remove persistent memory entries.
 *
 * Model-facing: the agent reads and curates its cross-session memory here.
 * Backed by `~/.dsh/memory/MEMORY.md` (same store the Web GUI panel and the
 * `dsh-mind memory` CLI read and write).
 *
 * @module @wumihaze/dsh-mind/tool/memory
 */

import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { dshHomePath } from '@deepseek-ai/dsh-home-paths'

/** Plugin name for the Loader manifest. */
export const name = 'dsh-tool-memory'
/** Services this plugin requires at mount time. */
export const inject = ['tools']

/** Default memory budget in characters (matches the Web GUI panel). */
const DEFAULT_BUDGET = 2200

/**
 * Configuration for the memory tool.
 * @public
 */
export interface Config {
  /** Override the dsh home (memory file lives at `<root>/memory/MEMORY.md`). */
  memoryRoot?: string
  /** Character budget before "add" is refused. Defaults to `2200`. */
  budget?: number
}

/** Absolute path of the memory file. */
function memoryPath(root: string): string {
  return join(root, 'memory', 'MEMORY.md')
}

/** Parse `- ` bullet lines out of MEMORY.md, ignoring the `# Memory` header. */
function readEntries(path: string): string[] {
  if (!existsSync(path)) return []
  const content = readFileSync(path, 'utf8')
  return content
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.startsWith('- '))
    .map((l) => l.slice(2))
}

/** Write entries back to MEMORY.md with the `# Memory` header. */
function writeEntries(path: string, entries: string[]): void {
  const dir = dirname(path)
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  const content = '# Memory\n' + entries.map((e) => `- ${e}`).join('\n') + (entries.length > 0 ? '\n' : '')
  writeFileSync(path, content, 'utf8')
}

/** List per-topic memory files beside MEMORY.md (comfyui.md, dsh.md, …). */
function readTopics(root: string): Array<{ name: string; title: string; text: string }> {
  const dir = join(root, 'memory')
  if (!existsSync(dir)) return []
  const topics: Array<{ name: string; title: string; text: string }> = []
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.md') && x !== 'MEMORY.md').sort()) {
    const text = readFileSync(join(dir, f), 'utf8')
    const title = (text.split('\n').find((l) => l.startsWith('# ')) ?? '').replace(/^#\s*/, '').trim() || f.replace(/\.md$/, '')
    topics.push({ name: f.replace(/\.md$/, ''), title, text })
  }
  return topics
}

/**
 * Register the `memory` tool on the context.
 * @param ctx - Cordis context carrying the tool service.
 * @param config - Optional configuration overrides.
 */
export function apply(ctx: Context, config: Config = {}): void {
  const root = config.memoryRoot ?? dshHomePath()
  const budget = config.budget ?? DEFAULT_BUDGET
  const path = memoryPath(root)

  const tool = defineTool({
    name: 'memory',
    description:
      'List, search, add, replace, or remove persistent memory entries. ' +
      'Memory holds cross-session facts, preferences, and lessons. Entries are short bullet notes ' +
      `(total budget ${budget} characters). Use "list" to see everything, "search" to find one, ` +
      '"add" to record a new fact, "replace" to update an entry by index, or "remove" to delete one.',
    parameters: {
      action: {
        type: 'string',
        required: true,
        enum: ['list', 'search', 'add', 'replace', 'remove'],
        description: 'The operation to perform.',
      },
      text: {
        type: 'string',
        description: 'New entry text (required for "add") or replacement text (required for "replace").',
      },
      query: {
        type: 'string',
        description: 'Search query (required for "search"). Case-insensitive substring match.',
      },
      index: {
        type: 'integer',
        description: '0-based entry index (required for "replace" and "remove").',
      },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          action: { type: 'string', required: true },
          status: { type: 'string', required: true },
          message: { type: 'string' },
          count: { type: 'integer' },
          index: { type: 'integer' },
          totalChars: { type: 'integer' },
          budget: { type: 'integer' },
          entries: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                index: { type: 'integer' },
                text: { type: 'string' },
              },
            },
          },
          topics: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                name: { type: 'string' },
                title: { type: 'string' },
              },
            },
          },
        },
      },
      render: (_args, value) => [{ type: 'text', text: formatOutput(value) }],
    },
    async execute(args) {
      const action = args.action as string
      const entries = readEntries(path)

      if (action === 'list') {
        const topics = readTopics(root).map((tp) => ({ name: tp.name, title: tp.title }))
        return {
          action,
          status: 'ok',
          count: entries.length,
          totalChars: entries.join('\n').length,
          budget,
          entries: entries.map((text, index) => ({ index, text })),
          topics,
        }
      }

      if (action === 'search') {
        const q = (args.query as string | undefined)?.toLowerCase() ?? ''
        if (!q) throw new Error('"query" is required for the "search" action')
        const hits = entries
          .map((text, index) => ({ index, text }))
          .filter((h) => h.text.toLowerCase().includes(q))
        // Also search the per-topic memory files (dsh.md, comfyui.md, …).
        const topicHits = readTopics(root)
          .filter((tp) => `${tp.name} ${tp.title} ${tp.text}`.toLowerCase().includes(q))
          .map((tp) => ({ name: tp.name, title: tp.title }))
        return { action, status: 'ok', query: q, count: hits.length, entries: hits, topics: topicHits }
      }

      if (action === 'add') {
        const text = (args.text as string | undefined)?.trim() ?? ''
        if (!text) throw new Error('"text" is required for the "add" action')
        const next = [...entries, text]
        const total = next.join('\n').length
        if (total > budget) {
          throw new Error(`memory budget exceeded: ${total} > ${budget} characters; replace or remove an entry first`)
        }
        writeEntries(path, next)
        return { action, status: 'added', index: next.length - 1, message: 'Memory entry added.', totalChars: total, budget }
      }

      if (action === 'replace') {
        const idx = args.index as number
        const text = (args.text as string | undefined)?.trim() ?? ''
        if (!Number.isInteger(idx) || idx < 0 || idx >= entries.length) {
          throw new Error(`invalid index ${String(idx)}: must be 0..${entries.length - 1}`)
        }
        if (!text) throw new Error('"text" is required for the "replace" action')
        entries[idx] = text
        writeEntries(path, entries)
        return { action, status: 'replaced', index: idx, message: 'Memory entry replaced.', totalChars: entries.join('\n').length }
      }

      if (action === 'remove') {
        const idx = args.index as number
        if (!Number.isInteger(idx) || idx < 0 || idx >= entries.length) {
          throw new Error(`invalid index ${String(idx)}: must be 0..${entries.length - 1}`)
        }
        entries.splice(idx, 1)
        writeEntries(path, entries)
        return { action, status: 'removed', index: idx, message: 'Memory entry removed.', count: entries.length }
      }

      throw new Error(`unknown action "${String(action)}"`)
    },
  })

  ctx.effect(() => ctx.tools.register(tool))
}

function formatOutput(value: Record<string, unknown>): string {
  const parts: string[] = []
  const action = value.action as string
  const status = value.status as string
  const entries = value.entries as Array<{ index: number; text: string }> | undefined
  const topics = value.topics as Array<{ name: string; title: string }> | undefined

  const renderTopics = () => {
    if (topics && topics.length > 0) {
      parts.push(`Topic files (${topics.length}):`)
      for (const tp of topics) parts.push(`- ${tp.title} (${tp.name}.md)`)
    }
  }

  if (action === 'list') {
    const count = value.count as number
    const budget = value.budget as number
    const totalChars = value.totalChars as number
    if (count === 0 && !(topics && topics.length > 0)) return `Memory is empty (${totalChars}/${budget} chars).`
    parts.push(`Quick memory (${count} entries, ${totalChars}/${budget} chars):`)
    for (const e of entries ?? []) parts.push(`[${e.index}] ${e.text}`)
    if (count === 0) parts.push('(no quick entries)')
    renderTopics()
    return parts.join('\n')
  }

  if (action === 'search') {
    const q = value.query as string
    const count = value.count as number
    const topicCount = topics?.length ?? 0
    if (count === 0 && topicCount === 0) return `No memory matches "${q}".`
    parts.push(`${count} quick entry match(es) for "${q}":`)
    for (const e of entries ?? []) parts.push(`[${e.index}] ${e.text}`)
    if (count === 0) parts.push('(no quick entries matched)')
    if (topicCount > 0) {
      parts.push(`${topicCount} topic file(s) match:`)
      for (const tp of topics ?? []) parts.push(`- ${tp.title} (${tp.name}.md)`)
    }
    return parts.join('\n')
  }

  return `${status}: ${(value.message as string) ?? ''}`
}
