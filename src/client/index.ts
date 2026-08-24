/**
 * dsh-mind client entry: registers the Mind settings section and i18n
 * into the DSH Web GUI via the slot system.
 */
import { MindSection } from './MindSection.tsx'
import { zh, en } from './locales.ts'

/** Plugin identifier for the DSH module loader. */
export const name = 'dsh-mind'

/** Cordis service names this client bundle injects. */
export const inject = ['slots', 'locale', 'theme'] as const

/** Locale namespace. */
const NS = 'dsh-mind'

interface ClientContext {
  readonly slots: {
    inject(slot: string, fn: () => void): void
    register(opts: Record<string, unknown>, Component: React.ComponentType<Record<string, never>>): void
  }
  readonly locale: {
    register(ns: string, dict: Record<string, Record<string, string>>): void
    bind(ns: string): (key: string) => string
  }
  readonly theme?: {
    getTheme(): unknown
    setTheme(id: string): void
  }
  effect(fn: () => (() => void | Promise<void>) | void, label?: string): void
  on(event: string, cb: (...args: unknown[]) => void): void
}

/**
 * Register the dsh-mind settings section.
 * @param ctx - Client context provided by the DSH web app.
 */
export function apply(ctx: ClientContext): void {
  // Register i18n dictionaries
  ctx.locale.register(NS, { zh, en })

  // Register the settings section
  ctx.slots.inject('settings.section', () => {
    ctx.slots.register(
      {
        name: 'dsh-mind',
        id: 'dsh-mind',
        order: 50,
        label: 'Mind',
        locale: { zh: '心智', en: 'Mind' },
      },
      MindSection,
    )
  })
}
