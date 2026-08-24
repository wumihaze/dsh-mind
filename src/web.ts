/**
 * dsh-mind web routes: function plugin that mounts HTTP API endpoints
 * for the DSH Web GUI panel (memory CRUD, skill stats, curator controls).
 */
import type { Context } from '@deepseek-ai/cordis'
import { mountMindRoutes, type MindHost } from './routes.ts'

/** Plugin name for cordis registration. */
export const name = 'dsh-mind-web'

/** No configurable options. */
export type Config = Record<string, never>

interface MindEffectHost extends MindHost {
  effect(callback: () => (() => void | Promise<void>), label: string): void
}

/**
 * Register the dsh-mind web routes against the host context.
 * @param ctx - Host context that may acquire the webServer service.
 * @param _config - Optional config (unused).
 */
export function apply(ctx: Context, _config?: Config): void {
  ctx.inject(['webServer'], (hostCtx: Context) => {
    const host = hostCtx as unknown as MindEffectHost
    host.effect(() => mountMindRoutes(host), 'dsh-mind: web routes')
  })
}
