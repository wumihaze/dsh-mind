/**
 * `memory-auto`: automatically extract durable facts from a finished
 * conversation and append them to the sticky-note memory (MEMORY.md).
 *
 * Host-plane. Listens for agent turns and, once a session goes idle after
 * `intervalTurns` assistant steps, debounces `debounceMs` and calls the model
 * (the session's own route, or a configured provider/model) to pull short
 * bullets out of the recent transcript. Output is filtered for secrets,
 * deduplicated against existing entries, and skipped when it would exceed the
 * budget — so auto-extraction never bloats or corrupts the memory.
 *
 * This is what makes memory "self-maintaining" without the agent having to
 * remember to call the `memory` tool.
 *
 * @module @wumihaze/dsh-mind/memory/auto
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import { dshHomePath } from '@deepseek-ai/dsh-home-paths'
import { foldRequestHeader } from '@deepseek-ai/dsh-session'
import { BlockAssembler, createUserMessage, type Message } from '@deepseek-ai/dsh-llm'
import type { Agent, PreStepDecision } from '@deepseek-ai/dsh-agent'

/** Plugin name for the Loader manifest. */
export const name = 'memory-auto'
/** Services this plugin requires at mount time. */
export const inject = ['agents', 'llm']

/**
 * Plugin config.
 * @public
 */
export interface Config {
  /** Master switch (default `true`). */
  enabled?: boolean
  /** Assistant steps before extraction is armed (default `10`). */
  intervalTurns?: number
  /** Debounce after the agent goes idle before calling the model (default `90000`). */
  debounceMs?: number
  /** Override provider/model for extraction; unset uses the session's own route. */
  provider?: string
  model?: string
  /** Recent transcript messages to feed the model (default `20`). */
  maxMessages?: number
  /** Max output tokens for the extraction call (default `500`). */
  maxOutputTokens?: number
  /** Override dsh home (memory file lives at `<root>/memory/MEMORY.md`). */
  memoryRoot?: string
  /** Sticky-note budget; extraction is skipped when it would exceed this (default `2200`). */
  budget?: number
}

const EXTRACT_SYSTEM = [
  'You maintain the user\'s sticky-note memory: a bullet list of durable facts that should persist across sessions.',
  'From the supplied conversation, extract facts worth remembering: user preferences, environment facts, stable conventions, resolved-issue lessons, corrections.',
  'Ignore noise, small talk, and one-off details.',
  'Do NOT repeat a fact that is already in the memory list.',
  'Output ONLY bullet lines, each starting with "- ". No explanations, no Markdown code fences.',
].join('\n')

/** Lines that look like secrets — never persist them. */
const SENSITIVE = /(sk-[a-zA-Z0-9_\-]{16,}|Bearer\s+\S+|api[_-]?key|access[_-]?token|password|secret|token)\s*[:=]\s*\S+|-----BEGIN [A-Z ]+ PRIVATE KEY-----/i

/** One per-agent extraction state. */
interface State {
  turns: number
  timer: ReturnType<typeof setTimeout> | undefined
  lastSeq: number
}

function memoryFile(root: string): string {
  return join(root, 'memory', 'MEMORY.md')
}

function readEntries(path: string): string[] {
  if (!existsSync(path)) return []
  return readFileSync(path, 'utf8')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.startsWith('- '))
    .map((l) => l.slice(2))
}

function writeEntries(path: string, entries: string[]): void {
  const dir = join(path, '..')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  const content = '# Memory\n' + entries.map((e) => `- ${e}`).join('\n') + (entries.length > 0 ? '\n' : '')
  writeFileSync(path, content, 'utf8')
}

/** Collect recent user/assistant text messages from a session log. */
function recentTranscript(session: { events: readonly unknown[] }, max: number): string[] {
  const lines: string[] = []
  for (const ev of session.events as ReadonlyArray<{ type?: string; data?: { message?: { content?: unknown[] } } }>) {
    if (ev.type !== 'user/message' && ev.type !== 'assistant/message') continue
    const content = ev.data?.message?.content
    if (!Array.isArray(content)) continue
    const text = content
      .filter((b): b is { type: 'text'; text: string } => typeof b === 'object' && b !== null && (b as { type?: string }).type === 'text' && typeof (b as { text?: string }).text === 'string')
      .map((b) => b.text)
      .join('')
    if (!text) continue
    lines.push(`${ev.type === 'user/message' ? 'user' : 'assistant'}: ${text}`)
    if (lines.length >= max) break
  }
  return lines.reverse()
}

/** Dedupe a candidate line against existing entries (case-insensitive). */
function isDuplicate(line: string, existing: string[]): boolean {
  const norm = line.toLowerCase()
  return existing.some((e) => e.toLowerCase() === norm || e.toLowerCase().includes(norm) || norm.includes(e.toLowerCase()))
}

/**
 * Install the auto-extraction listener.
 * @param ctx - Cordis context with the agents and llm services.
 * @param config - resolved plugin config.
 */
export function apply(ctx: Context, config: Config): void {
  if (config.enabled === false) return
  const intervalTurns = config.intervalTurns ?? 10
  const debounceMs = config.debounceMs ?? 90_000
  const maxMessages = config.maxMessages ?? 20
  const maxOutputTokens = config.maxOutputTokens ?? 500
  const root = config.memoryRoot ?? dshHomePath()
  const path = memoryFile(root)
  const budget = config.budget ?? 2200

  const states = new WeakMap<Agent, State>()
  const stateOf = (agent: Agent): State => {
    let s = states.get(agent)
    if (s === undefined) {
      s = { turns: 0, timer: undefined, lastSeq: 0 }
      states.set(agent, s)
    }
    return s
  }

  // Count assistant steps per agent.
  ctx.on('agent/pre-step', (payload: { agent: Agent }, next: () => Promise<PreStepDecision>) =>
    (async () => {
      const s = stateOf(payload.agent)
      s.turns += 1
      return next()
    })(),
  )

  // On idle, arm the debounced extraction.
  ctx.on('agent/status', ({ agent, status }: { agent: Agent; status: string }) => {
    if (status !== 'idle') return
    const s = stateOf(agent)
    if (s.turns < intervalTurns) return
    if (s.timer !== undefined) clearTimeout(s.timer)
    s.timer = setTimeout(() => {
      s.timer = undefined
      s.turns = 0
      void runExtraction(agent).catch((e) => {
        ctx.logger.warn(e instanceof Error ? e : new Error(String(e)))
      })
    }, debounceMs)
  })

  async function runExtraction(agent: Agent): Promise<void> {
    const session = agent.session
    if (!session) return

    // Resolve the model route: explicit config wins, else the session's own.
    const header = foldRequestHeader(session.events)
    const provider = config.provider ?? header?.config?.provider
    const model = config.model ?? header?.config?.model
    if (!provider || !model) return

    const transcript = recentTranscript(session, maxMessages)
    if (transcript.length === 0) return

    const existing = readEntries(path)
    const memoryList = existing.length > 0 ? existing.join('\n') : '(empty)'

    const user = createUserMessage({
      content: [{
        type: 'text',
        text: `Current memory:\n${memoryList}\n\nRecent conversation:\n${transcript.join('\n')}`,
      }],
      source: { kind: 'plugin', plugin: 'memory-auto' },
    })

    const options = {
      provider,
      model,
      messages: [user as Message],
      system: EXTRACT_SYSTEM,
      maxTokens: maxOutputTokens,
      sessionId: session.id,
      // `purpose` is typed as the built-in set; use it as an attribution label.
      purpose: 'memory-auto' as 'session-title',
      signal: AbortSignal.timeout(60_000),
    }

    const assembler = new BlockAssembler()
    for await (const chunk of ctx.llm.stream(options)) assembler.push(chunk)
    const text = assembler.blocks()
      .filter((b) => b.type === 'text')
      .map((b) => b.text)
      .join('')

    const candidates = text
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.startsWith('- '))
      .map((l) => l.slice(2).trim())
      .filter((l) => l.length > 0 && !SENSITIVE.test(l))

    // Dedupe against current memory + within the batch.
    const seen = new Set(existing.map((e) => e.toLowerCase()))
    const fresh: string[] = []
    for (const c of candidates) {
      const key = c.toLowerCase()
      if (seen.has(key)) continue
      seen.add(key)
      if (!isDuplicate(c, existing) && !isDuplicate(c, fresh)) fresh.push(c)
    }
    if (fresh.length === 0) return

    const next = [...existing, ...fresh]
    const total = next.join('\n').length
    if (total > budget) {
      ctx.logger.warn(`memory-auto: skipping ${fresh.length} candidate(s) — would exceed ${budget}-char budget`)
      return
    }
    writeEntries(path, next)
    ctx.logger.info(`memory-auto: appended ${fresh.length} fact(s) to sticky notes`)
  }
}
