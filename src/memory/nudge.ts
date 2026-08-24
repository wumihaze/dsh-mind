/**
 * Periodic memory-review nudge. While a noteworthy event (a user message or a
 * failed tool call) has happened since the agent's last memory write, it
 * reminds the model to review its memory every `intervalTurns` assistant
 * steps.
 * @module @wumihaze/dsh-mind/memory/nudge
 */

import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import type { Agent, PreStepDecision } from '@deepseek-ai/dsh-agent'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import type { MessageSource } from '@deepseek-ai/dsh-llm'
import type { UserMessage } from '@deepseek-ai/dsh-session'
import type { PostToolDecision } from '@deepseek-ai/dsh-tools'

/** Cordis plugin name. */
export const name = 'memory-review-nudge'

/**
 * Plugin config.
 * @public
 */
export interface Config {
  /**
   * Assistant steps between review reminders while the signal is active
   * (default `8`).
   */
  intervalTurns?: number
}

export const Config: z<Config> = z.object({
  intervalTurns: z.number().default(8),
})

const PLUGIN_SOURCE: MessageSource = { kind: 'plugin', plugin: 'memory-review-nudge' }

export const NUDGE_TEXT =
  'Memory review reminder: since your last memory write, something noteworthy happened — '
  + 'a user correction, a new fact about the environment, or a resolved error. '
  + 'Review what has happened and update your memory entries if warranted: add, replace, '
  + 'or remove. If nothing is worth persisting, continue without writing.'

interface State {
  turnsSinceWrite: number
  signal: boolean
  lastNudgeTurn: number
}

function isMemoryWrite(args: unknown): boolean {
  if (typeof args !== 'object' || args === null) return false
  const action = (args as Record<string, unknown>).action
  return action === 'add' || action === 'replace' || action === 'remove'
}

/**
 * Install the nudge on a preset plane.
 * @param ctx - Cordis context.
 * @param config - resolved plugin config.
 */
export function apply(ctx: Context, config: Config): void {
  const rawInterval = config.intervalTurns
  if (typeof rawInterval !== 'number' || !Number.isInteger(rawInterval) || rawInterval < 1) {
    throw new TypeError(
      `memory-review-nudge: intervalTurns must be an integer >= 1 (got ${String(rawInterval)})`,
    )
  }
  const interval = rawInterval

  const states = new WeakMap<Agent, State>()
  const state = (agent: Agent): State => {
    let s = states.get(agent)
    if (s === undefined) {
      s = { turnsSinceWrite: 0, signal: false, lastNudgeTurn: 0 }
      states.set(agent, s)
    }
    return s
  }
  const nudgeMessage = (): UserMessage =>
    createUserMessage({
      content: [{ type: 'text', text: NUDGE_TEXT }],
      source: { ...PLUGIN_SOURCE, form: 'notice', summary: 'memory review' },
    })

  ctx.on('agent/pre-step', (payload, next): Promise<PreStepDecision> =>
    (async () => {
      const decision = await next()
      if (decision.kind !== 'enter') return decision
      const s = state(payload.agent)
      if (payload.messages.some(message => message.source.kind === 'user')) s.signal = true
      s.turnsSinceWrite += 1
      if (s.signal && s.turnsSinceWrite - s.lastNudgeTurn >= interval) {
        s.lastNudgeTurn = s.turnsSinceWrite
        return { kind: 'enter', messages: [...decision.messages, nudgeMessage()] }
      }
      return decision
    })(),
  )

  ctx.on('tools/post-execute', (exec, result, next): Promise<PostToolDecision> =>
    (async () => {
      const downstream = await next()
      if (exec.agent !== undefined) {
        const s = state(exec.agent)
        if (exec.name === 'memory' && isMemoryWrite(exec.arguments) && result.isError === false) {
          s.turnsSinceWrite = 0
          s.signal = false
          s.lastNudgeTurn = 0
        } else if (result.isError === true) {
          s.signal = true
        }
      }
      return downstream
    })(),
  )
}
