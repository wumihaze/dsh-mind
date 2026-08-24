/**
 * tsdown config for the dsh-mind client bundle.
 * Emits a closure-factory artifact: `window.__ModuleLoader__.load({id, factory})`
 * that resolves externals through the injected `require` (DSH module table).
 * CSS modules are compiled by lightningcss and inlined as style-injection modules.
 */
import { readFile } from 'node:fs/promises'
import { basename, resolve } from 'node:path'
import type { UserConfig, Plugin } from 'tsdown'
import { transform } from 'lightningcss'

const PLUGIN_ID = '@wumihaze/dsh-mind'

/**
 * CSS Modules plugin: intercepts `.module.css` imports, compiles with
 * lightningcss, and emits a style-injection module that exports the class map.
 */
function cssModulesPlugin(): Plugin {
  const CSS_RE = /\.module\.css$/
  return {
    name: 'dsh-mind-css-modules',
    resolveId(source, importer) {
      if (CSS_RE.test(source)) {
        const resolved = resolve(dirname(importer ?? '.'), source)
        return `\0dsh-css:${resolved}.mjs`
      }
      return null
    },
    async load(id) {
      if (id.startsWith('\0dsh-css:')) {
        let fileId = id.slice('\0dsh-css:'.length)
        // Strip the .mjs suffix we added to prevent CSS extraction
        if (fileId.endsWith('.mjs')) fileId = fileId.slice(0, -4)
        const source = await readFile(fileId, 'utf-8')
        const result = transform({
          filename: fileId,
          code: new TextEncoder().encode(source),
          minify: true,
          drafts: { nesting: true },
        })
        const css = result.code.toString()
        // Build a class map from the compiled CSS (extract .className selectors)
        const classMap: Record<string, string> = {}
        const selectorRe = /\.([a-zA-Z_][a-zA-Z0-9_-]*)/g
        let m: RegExpExecArray | null
        while ((m = selectorRe.exec(css)) !== null) {
          const name = m[1]
          // Hash for scope isolation
          const hash = simpleHash(`${PLUGIN_ID}/${basename(fileId)}/${name}`)
          classMap[name] = `dsw-${hash}`
        }
        // Compile CSS with hashed class names
        let compiledCss = css
        for (const [name, hashed] of Object.entries(classMap)) {
          compiledCss = compiledCss.replace(new RegExp(`\\.${name}(?![a-zA-Z0-9_-])`, 'g'), `.${hashed}`)
        }
        const tagId = `${PLUGIN_ID}/${basename(fileId)}`
        return [
          `const css = ${JSON.stringify(compiledCss)};`,
          `const tagId = ${JSON.stringify(tagId)};`,
          `if (typeof document !== 'undefined' && document.querySelector('style[data-plugin-css=' + JSON.stringify(tagId) + ']') === null) {`,
          `  const tag = document.createElement('style');`,
          `  tag.dataset.plugin = ${JSON.stringify(PLUGIN_ID)};`,
          `  tag.dataset.pluginCss = tagId;`,
          `  tag.textContent = css;`,
          `  document.head.appendChild(tag);`,
          `}`,
          `export default ${JSON.stringify(classMap)};`,
          ``,
        ].join('\n')
      }
      return null
    },
  }
}

function dirname(p: string): string {
  return p.replace(/[\\/][^\\/]+$/, '')
}

function simpleHash(str: string): string {
  let h = 0
  for (let i = 0; i < str.length; i++) {
    h = (h * 31 + str.charCodeAt(i)) | 0
  }
  return Math.abs(h).toString(36)
}

const EXTERNALS = [
  'react',
  'react/jsx-runtime',
  'react-dom',
  '@deepseek-ai/dsh-client-ui-primitives',
  '@deepseek-ai/dsh-client-runtime',
  '@deepseek-ai/dsh-client-locale',
  '@deepseek-ai/dsh-client-ui-settings',
  'clsx',
]

export default {
  entry: { 'client': 'src/client/index.ts' },
  format: 'cjs',
  dts: false,
  external: EXTERNALS,
  plugins: [cssModulesPlugin()],
  outDir: 'client',
  output: {
    entryFileNames: '[name].js',
    exports: 'named',
  },
  // Post-process: wrap in window.__ModuleLoader__.load
  hooks: {
    'build:done': async () => {
      const { readFile: rf, writeFile: wf, rename } = await import('node:fs/promises')
      const { existsSync } = await import('node:fs')
      const { join } = await import('node:path')
      const outDir = 'client'
      const cjsFile = join(outDir, 'client.cjs')
      const jsFile = join(outDir, 'client.js')
      // Rename .cjs → .js
      if (existsSync(cjsFile) && !existsSync(jsFile)) {
        await rename(cjsFile, jsFile)
      }
      const content = await rf(jsFile, 'utf-8')
      const wrapped = [
        `window.__ModuleLoader__.load({ id: ${JSON.stringify(PLUGIN_ID)}, factory: (require) => {`,
        'var module = { exports: {} };',
        'var exports = module.exports;',
        'Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });',
        content,
        // Without this, the factory returns undefined and the client module
        // loader rejects the bundle ("invalid plugin ... received undefined").
        'return module.exports;',
        `}});`,
        '',
      ].join('\n')
      await wf(jsFile, wrapped, 'utf-8')
    },
  },
} satisfies UserConfig
