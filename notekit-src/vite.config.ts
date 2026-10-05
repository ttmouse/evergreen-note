import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, URL } from 'node:url'

const SRC = fileURLToPath(new URL('./src', import.meta.url))
const DEV_PORT = Number(process.env.NOTEKIT_DEV_PORT || 3000)
const API_PORT = Number(process.env.NOTEKIT_PORT || 11820)
const EXT_TRY = ['', '.ts', '.tsx', '.js', '.jsx', '.css', '.less', '.json']

function resolvable(abs: string): boolean {
  for (const e of EXT_TRY) if (fs.existsSync(abs + e)) return true
  if (fs.existsSync(abs) && fs.statSync(abs).isDirectory()) {
    for (const i of ['index.ts', 'index.tsx', 'index.js']) {
      if (fs.existsSync(path.join(abs, i))) return true
    }
  }
  return false
}

function walk(dir: string, out: string[] = []): string[] {
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name)
    const st = fs.statSync(p)
    if (st.isDirectory()) {
      if (name !== 'node_modules') walk(p, out)
    } else if (/\.(ts|tsx|js|jsx)$/.test(name)) {
      out.push(p)
    }
  }
  return out
}

const IMPORT_RE = /(?:^|\n)\s*(?:import|export)\s+(?:type\s+)?([^'"]*?)\s*from\s*['"]([^'"]+)['"]/g

/**
 * 把「解析不到的模块」短路成占位模块。
 *
 * source map 只收录编译后产生代码的模块，因此还原不出来的有三类：
 *   1. 纯 re-export 的 barrel（rollup 消除）
 *   2. 纯类型声明（.d.ts / 类型模块）
 *   3. 样式与 JSON（编译后并入 index.css / 被内联）
 * 另有少量**有真实代码但未进 map** 的模块（在 bundle 里也找不到其符号）。
 *
 * 占位模块按「谁 import 了什么名字」生成同名导出，使构建通过、程序可启动；
 * 真正影响功能的那些需要按用法重建（见 notes/evidence/notekit-probe/README.md）。
 */
function stubMissingModules() {
  // 预扫描：收集每个解析不到的模块被 import 的名字
  const names = new Map<string, Set<string>>()
  const hasDefault = new Set<string>()
  const users = new Map<string, Set<string>>()

  const absOf = (spec: string, importer: string): string | null => {
    const clean = spec.split('?')[0].split('#')[0]
    if (clean === '@') return SRC
    if (clean.startsWith('@/')) return path.join(SRC, clean.slice(2))
    if (clean.startsWith('.')) return path.resolve(path.dirname(importer), clean)
    return null
  }

  return {
    name: 'stub-missing-modules',
    buildStart() {
      names.clear()
      hasDefault.clear()
      users.clear()
      for (const file of walk(SRC)) {
        const code = fs.readFileSync(file, 'utf8')
        for (const m of code.matchAll(IMPORT_RE)) {
          const clause = m[1].trim()
          const abs = absOf(m[2], file)
          if (!abs || resolvable(abs)) continue
          if (!names.has(abs)) {
            names.set(abs, new Set())
            users.set(abs, new Set())
          }
          users.get(abs)!.add(path.relative(process.cwd(), file))
          if (clause.startsWith('{')) {
            for (const part of clause.replace(/[{}]/g, '').split(',')) {
              const n = part.trim().split(/\s+as\s+/)[0].trim()
              if (n && n !== 'type') names.get(abs)!.add(n)
            }
          } else if (clause && !clause.startsWith('*')) {
            // 默认导入：形如 `import Foo from '...'`
            hasDefault.add(abs)
          }
        }
      }
    },
    resolveId(source: string, importer?: string) {
      if (!importer) return null
      const abs = absOf(source, importer)
      if (!abs || resolvable(abs)) return null
      // 虚拟 id 不以 .css/.less 结尾，否则会被 Vite 的样式管线接走
      return '\0stub:' + abs + '.stub.js'
    },
    load(id: string) {
      if (!id.startsWith('\0stub:')) return null
      const abs = id.slice('\0stub:'.length, -'.stub.js'.length)
      const out: string[] = [
        '// 还原占位模块：原模块不在 source map 中。',
        '// 导出按引用方收集的名字生成，避免构建期报错；运行时可能为占位行为。',
      ]
      // 导出为可调用的空函数：既满足构建期「有该导出」，运行时也不会因
      // 「X is not a function」直接崩掉，能继续暴露后续问题。
      const rel = path.relative(SRC, abs)
      for (const n of names.get(abs) ?? []) {
        out.push(`export const ${n} = (..._a) => { throw new Error('STUB_HIT:' + ${JSON.stringify(rel)} + '#' + ${JSON.stringify(n)}) }`)
      }
      if (hasDefault.has(abs)) {
        out.push(`export default (..._a) => { throw new Error('STUB_HIT:' + ${JSON.stringify(rel)} + '#default') }`)
      }
      if (!out.length) out.push('export {}')
      return out.join('\n') + '\n'
    },
    buildEnd() {
      if (!names.size) return
      const placeholders = [...names.keys()]
        .filter((p) => !/\.(css|less|scss|sass|json|svg|png|jpg)$/.test(p))
        .map((p) => path.relative(process.cwd(), p))
      console.log(`\n[stub] 共短路 ${names.size} 个解析不到的模块。`)
      console.log(`[stub] 其中非样式/资源类（需关注） ${placeholders.length} 个：`)
      for (const p of placeholders.sort()) {
        console.log(`   ${p}   ← ${[...(users.get(path.resolve(process.cwd(), p)) ?? [])].slice(0, 2).join(', ')}`)
      }
      console.log('')
    },
  }
}

// 说明：
// - 别名 @ 指向 src/：源码通篇使用 @/slate-item/...、@/i18n
// - base 取 /static/：与原构建产物一致（服务端就在 /static/index.js 提供前端）
// - 端口 3000：constants.ts 里 DEBUG_MODE = hostname==='localhost' && port==='3000'
export default defineConfig({
  base: '/static/',
  plugins: [
    react(),
    stubMissingModules(),
    {
      name: 'reload-app-on-source-change',
      handleHotUpdate({ file, server }) {
        // App startup creates global containers and registers stateful addons.
        // Re-evaluating these modules through Fast Refresh duplicates that state.
        if (file.startsWith(SRC + path.sep) && /\.[jt]sx?$/.test(file)) {
          server.ws.send({ type: 'full-reload' })
          return []
        }
      },
    },
  ],
  resolve: { alias: { '@': SRC } },
  server: {
    port: DEV_PORT,
    host: 'localhost',
    proxy: {
      '/api': `http://127.0.0.1:${API_PORT}`,
      '/static/assets': `http://127.0.0.1:${API_PORT}`,
    },
  },
  preview: { port: DEV_PORT, host: 'localhost' },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'es2020',
    sourcemap: true,
  },
})
