/**
 * Minimal inline skill validation for the dsh-mind bundle.
 *
 * Provides the same `validateSkillContent` API as `@deepseek-ai/dsh-skill-validate`
 * but inlined so the bundle is self-contained.
 *
 * @module @wumihaze/dsh-mind/skill-validate
 */

import { parseDocument } from 'yaml'

const OPEN_DELIMITER = /^---\s*$/
const CLOSE_DELIMITER = /^---\s*$|\.\.\.\s*$/
const NAME_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/

const NAME_MAX_LENGTH = 64
const DESCRIPTION_MAX_LENGTH = 1024
const DESCRIPTION_VAGUE_BELOW = 20

/** A validation issue. */
export interface SkillValidationIssue {
  rule: string
  message: string
}

/** Validation status. */
export type SkillValidationStatus = 'pass' | 'warn' | 'fail'

/** Validation report for one skill entry. */
export interface SkillValidationReport {
  name: string
  path: string
  status: SkillValidationStatus
  errors: SkillValidationIssue[]
  warnings: SkillValidationIssue[]
  infos: SkillValidationIssue[]
}

/**
 * Validate raw SKILL.md content against the Agent Skills spec.
 * @param content - Raw file content.
 * @param path - Display path of the file.
 * @param dirName - Parent directory name (e.g. the skill name), or `null`.
 * @returns The validation report.
 */
export function validateSkillContent(content: string, path: string, dirName: string | null): SkillValidationReport {
  const text = content.charCodeAt(0) === 0xfeff ? content.slice(1) : content
  const lines = text.split(/\r?\n/)

  let frontmatter: Record<string, unknown> | null = null
  let frontmatterMissing = false
  let frontmatterError = ''

  if (!OPEN_DELIMITER.test(lines[0]!)) {
    frontmatterMissing = true
  } else {
    const close = lines.slice(1).findIndex(line => CLOSE_DELIMITER.test(line.trimEnd()))
    if (close === -1) {
      frontmatterError = 'frontmatter is not closed by a --- or ... line'
    } else {
      const yamlText = lines.slice(1, close + 1).join('\n')
      const document = parseDocument(yamlText)
      if (document.errors.length > 0) {
        frontmatterError = document.errors.map(e => e.message).join('; ')
      } else {
        const value: unknown = document.toJS()
        if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
          frontmatter = value as Record<string, unknown>
        } else if (value === null || value === undefined) {
          frontmatter = {}
        } else {
          frontmatterError = `frontmatter must be a YAML mapping; got ${Array.isArray(value) ? 'a sequence' : typeof value}`
        }
      }
    }
  }

  const errors: SkillValidationIssue[] = []
  const warnings: SkillValidationIssue[] = []
  const infos: SkillValidationIssue[] = []
  let name = dirName !== null ? dirName : path.replace(/\.md$/i, '').split(/[\\/]/).pop()!

  if (frontmatterMissing) {
    errors.push({ rule: 'frontmatter.missing', message: 'SKILL.md must begin with YAML frontmatter followed by Markdown content.' })
  } else if (frontmatter === null) {
    errors.push({ rule: 'frontmatter.invalid', message: `Frontmatter is not a valid YAML mapping: ${frontmatterError}` })
  } else {
    const fm = frontmatter

    const nameValue = fm['name']
    if (nameValue === undefined) {
      errors.push({ rule: 'name.required', message: "Required field 'name' is missing." })
    } else if (typeof nameValue !== 'string') {
      errors.push({ rule: 'name.type', message: "Field 'name' must be a string." })
    } else {
      name = nameValue
      if (name.length < 1 || name.length > NAME_MAX_LENGTH) {
        errors.push({ rule: 'name.length', message: `Field 'name' must be 1-${NAME_MAX_LENGTH} characters; got ${name.length}.` })
      }
      if (!NAME_PATTERN.test(name)) {
        errors.push({ rule: 'name.chars', message: "Field 'name' may only contain lowercase letters, numbers, and single hyphens." })
      }
      if (dirName !== null && name !== dirName) {
        errors.push({ rule: 'name.matches-dir', message: `Field 'name' ('${name}') must match the parent directory name ('${dirName}').` })
      }
    }

    const description = fm['description']
    if (description === undefined) {
      errors.push({ rule: 'description.required', message: "Required field 'description' is missing." })
    } else if (typeof description !== 'string') {
      errors.push({ rule: 'description.type', message: "Field 'description' must be a string." })
    } else if (description.length < 1 || description.length > DESCRIPTION_MAX_LENGTH) {
      errors.push({ rule: 'description.length', message: `Field 'description' must be 1-${DESCRIPTION_MAX_LENGTH} characters; got ${description.length}.` })
    } else if (description.length < DESCRIPTION_VAGUE_BELOW) {
      warnings.push({ rule: 'description.vague', message: "Field 'description' is very short: state what the skill does and when to use it." })
    }
  }

  const status: SkillValidationStatus = errors.length > 0 ? 'fail' : warnings.length > 0 ? 'warn' : 'pass'
  return { name, path, status, errors, warnings, infos }
}
