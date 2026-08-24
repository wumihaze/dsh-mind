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
  // Register i18n dictionaries, then bind the per-locale translator.
  ctx.locale.register(NS, { zh, en })
  const t = ctx.locale.bind(NS)

  // Register the settings section. `name` is the slot this registers into
  // (the parent "settings.section"); `id` is this plugin's unique slot id.
  // The `label` is a function (dynamic), `locale` is the namespace, and
  // `inject` hands `t` to the panel — all matching the `dshmarket` client so
  // the UI follows the app's language instead of staying English.
  ctx.slots.inject('settings.section', () => {
    ctx.slots.register(
      {
        name: 'settings.section',
        id: 'dsh-mind',
        order: 50,
        label: () => t('section.nav'),
        locale: NS,
        inject: () => ({ t }),
      },
      MindSection,
    )
  })
}
