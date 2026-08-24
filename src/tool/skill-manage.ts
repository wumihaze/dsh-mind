/**
 * `skill_manage` tool: create, patch, or archive skills in the user skill set.
 *
 * Model-facing: the model calls this tool to self-manage its skill catalog.
 * Host-plane: writes files under `~/.dsh/skills/` and records telemetry.
 *
 * @module @wumihaze/dsh-mind/tool/skill-manage
 */

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { dshHomePath } from '@deepseek-ai/dsh-home-paths'
import type { SkillUsageService } from '../skill-usage/index.ts'
import { validateSkillContent } from '../skill-validate.ts'

/** Plugin name for the Loader manifest. */
export const name = 'dsh-tool-skill-manage'
/** Services this plugin requires at mount time. */
export const inject = ['tools']

/** Skill name pattern: kebab-case, 1-64 characters. */
const SKILL_NAME_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/

/**
 * Configuration for the skill_manage tool.
 * @public
 */
export interface Config {
  /** Override the base skills directory. Defaults to `~/.dsh/skills`. */
  skillsRoot?: string
}

/**
 * Register the `skill_manage` tool on the context.
 * @param ctx - Cordis context carrying the tool service.
 * @param config - Optional configuration overrides.
 */
export function apply(ctx: Context, config: Config = {}): void {
  const skillsRoot = config.skillsRoot ?? dshHomePath('skills')

  const usage = ctx.get('skillUsage') as SkillUsageService | undefined

  function ensureUsage(): SkillUsageService | undefined {
    if (usage && !usage.isLoaded) usage.load()
    return usage
  }

  function skillPath(name: string): string {
    return join(skillsRoot, name, 'SKILL.md')
  }

  function archiveDir(name: string): string {
    return join(skillsRoot, '.system', 'archive', name)
  }

  const tool = defineTool({
    name: 'skill_manage',
    description:
      'Create, patch, or archive a skill in the user skill set. ' +
      'Use "create" to add a new skill, "patch" to modify an existing one, or "delete" to archive it. ' +
      'Archived skills are moved to a hidden directory and no longer appear in the skill catalog.',
    parameters: {
      action: {
        type: 'string',
        required: true,
        enum: ['create', 'patch', 'delete'],
        description: 'The operation to perform.',
      },
      name: {
        type: 'string',
        required: true,
        description: 'The skill name (kebab-case, e.g. "my-skill").',
      },
      content: {
        type: 'string',
        description: 'Full SKILL.md content with YAML frontmatter (required for "create").',
      },
      old_string: {
        type: 'string',
        description: 'Exact text to find in the existing SKILL.md (required for "patch"). Must match exactly once.',
      },
      new_string: {
        type: 'string',
        description: 'Replacement text (required for "patch"). Use an empty string to delete the matched text.',
      },
      reason: {
        type: 'string',
        description: 'Human-readable explanation of why this operation is being performed.',
      },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          action: { type: 'string', required: true },
          name: { type: 'string', required: true },
          status: { type: 'string', required: true },
          message: { type: 'string', required: true },
          validation: {
            type: 'object',
            additionalProperties: false,
            properties: {
              status: { type: 'string' },
              errors: { type: 'array', items: { type: 'string' } },
              warnings: { type: 'array', items: { type: 'string' } },
            },
          },
        },
      },
      render: (_args, value) => [{ type: 'text', text: formatOutput(value) }],
    },
    async execute(args) {
      const name = args.name as string
      const action = args.action as string

      if (!SKILL_NAME_PATTERN.test(name) || name.length > 64) {
        throw new Error(`invalid skill name "${name}": must be kebab-case (a-z, 0-9, hyphens), at most 64 characters`)
      }

      if (action === 'create') {
        return doCreate()
      }
      if (action === 'patch') {
        return doPatch()
      }
      return doDelete()

      function doCreate() {
        const content = args.content as string | undefined
        if (!content) throw new Error('"content" is required for the "create" action')

        const path = skillPath(name)
        if (existsSync(path)) {
          throw new Error(`skill "${name}" already exists at ${path}; use "patch" to modify it`)
        }

        const report = validateSkillContent(content, path, name)
        if (report.status === 'fail') {
          const errors = report.errors.map(e => e.message).join('; ')
          throw new Error(`skill validation failed: ${errors}`)
        }

        const dir = dirname(path)
        if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
        writeFileSync(path, content, 'utf8')

        const usage2 = ensureUsage()
        if (usage2) {
          usage2.setProvenance(name, 'agent-created')
          usage2.recordUse(name)
          usage2.save()
        }

        const warnings = report.warnings.map(w => w.message)
        return {
          action,
          name,
          status: 'created',
          message: `Skill "${name}" created.`,
          ...(warnings.length > 0 ? { validation: { status: report.status, errors: [], warnings } } : {}),
        }
      }

      function doPatch() {
        const oldStr = args.old_string as string | undefined
        const newStr = args.new_string as string | undefined
        if (oldStr === undefined) throw new Error('"old_string" is required for the "patch" action')
        if (newStr === undefined) throw new Error('"new_string" is required for the "patch" action (use "" to delete)')

        const path = skillPath(name)
        if (!existsSync(path)) {
          throw new Error(`skill "${name}" not found at ${path}; use "create" to add it first`)
        }

        const current = readFileSync(path, 'utf8')
        const count = current.split(oldStr).length - 1
        if (count === 0) {
          throw new Error(`"old_string" not found in skill "${name}"`)
        }
        if (count > 1) {
          throw new Error(`"old_string" matches ${count} times in skill "${name}"; it must be unique`)
        }

        const updated = current.replace(oldStr, newStr)
        writeFileSync(path, updated, 'utf8')

        const usage2 = ensureUsage()
        if (usage2) {
          usage2.recordPatch(name)
          usage2.save()
        }

        return {
          action,
          name,
          status: 'patched',
          message: `Skill "${name}" patched.`,
        }
      }

      function doDelete() {
        const path = skillPath(name)
        if (!existsSync(path)) {
          throw new Error(`skill "${name}" not found at ${path}; it may already be archived`)
        }

        const usage2 = ensureUsage()
        if (usage2?.isPinned(name)) {
          throw new Error(`skill "${name}" is pinned (reason: ${usage2.get(name)?.pin_reason ?? 'unspecified'}); unpin it before archiving`)
        }

        const skillDir = dirname(path)
        const dest = archiveDir(name)
        const destParent = dirname(dest)
        if (!existsSync(destParent)) mkdirSync(destParent, { recursive: true })

        if (existsSync(dest)) {
          renameSync(dest, `${dest}.bak-${Date.now()}`)
        }
        renameSync(skillDir, dest)

        if (usage2) {
          usage2.recordUse(name)
          usage2.save()
        }

        return {
          action,
          name,
          status: 'archived',
          message: `Skill "${name}" archived to ${dest}.`,
        }
      }
    },
  })

  ctx.effect(() => ctx.tools.register(tool))
}

function formatOutput(value: Record<string, unknown>): string {
  const parts: string[] = []
  const status = value.status as string
  const message = value.message as string

  parts.push(`${status}: ${message}`)

  const validation = value.validation as Record<string, unknown> | undefined
  if (validation) {
    const warnings = validation.warnings as string[] | undefined
    if (warnings && warnings.length > 0) {
      parts.push(`Warnings: ${warnings.join('; ')}`)
    }
  }

  return parts.join('\n')
}
