/**
 * Skill guidance: inject a system-prompt section that teaches the agent how
 * to use its skill library effectively.
 * @module @wumihaze/dsh-mind/memory/guidance
 */

import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-system-prompt'

/** The prompt section this plugin registers. */
export const SKILL_GUIDANCE_SECTION = 'mind:skill-guidance'

/** Cordis plugin name. */
export const name = 'memory-skill-guidance'

/** Declared injections. */
export const inject = ['systemPrompt']

/**
 * Plugin config.
 * @public
 */
export interface Config {
  /**
   * Whether the guidance section is enabled (default `true`).
   */
  enabled?: boolean
}

const GUIDANCE_TEXT = [
  'You have a personal skill library at ~/.dsh/skills/. Skills are reusable instructions for recurring tasks.',
  '',
  'When to use skills:',
  '- Before starting a task you have done before, check if a relevant skill exists.',
  '- If a skill exists for your current task, load it and follow its instructions.',
  '- If a task goes well and would benefit from being codified, consider saving it as a new skill.',
  '',
  'Skill management:',
  '- Use the `skill_manage` tool to create, patch, or delete skills.',
  '- Keep skills focused: one skill per workflow.',
  '- Update skills when you discover better approaches.',
  '- Archive skills that are no longer relevant (the curator handles this automatically).',
  '',
  'Provenance:',
  '- Skills you create are marked with provenance "user".',
  '- The curator may archive stale skills but never deletes user-pinned skills.',
].join('\n')

/**
 * Install the skill-guidance system prompt section.
 * @param ctx - Cordis context.
 * @param config - resolved plugin config.
 */
export function apply(ctx: Context, config: Config): void {
  if (config.enabled === false) return
  ctx.effect(() => ctx.systemPrompt.section({
    name: SKILL_GUIDANCE_SECTION,
    order: 117,
    text: GUIDANCE_TEXT,
  }), 'mind-skill-guidance.section()')
}
