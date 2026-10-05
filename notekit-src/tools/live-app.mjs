import { build } from 'vite'
import { access, cp, mkdir, writeFile, rename } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../', import.meta.url))
const target = process.env.NOTEKIT_LIVE_APP || path.join(root, 'build', 'Evergreen note.app', 'Contents', 'Resources', 'app')
const staging = path.join(root, 'tmp', 'live-app-build')
await access(path.join(target, 'desktop', 'main.cjs'))

// Serialize publishes: overlapping watch rebuilds race on the same destination.
let publishing = Promise.resolve()
function enqueue(job) {
  publishing = publishing.then(job, job)
  return publishing
}

// cp deletes files it overwrites; a concurrent publish can make them vanish
// between listing and unlinking (ENOENT from cp 内部的 unlink/copy). 重试到成功为
// 止（带上限），因为 watch 模式下每次重 build 都会再次触发发布，下一条机会还很远。
async function copyWithRetry(src, dest) {
  for (let attempt = 0; ; attempt++) {
    try {
      await cp(src, dest, { recursive: true })
      return
    } catch (err) {
      if (err?.code !== 'ENOENT' || attempt >= 5) throw err
      await new Promise((resolve) => setTimeout(resolve, 200 * (attempt + 1)))
    }
  }
}

await build({
  root,
  build: { outDir: staging, emptyOutDir: false, watch: {}, sourcemap: false },
  plugins: [{
    name: 'publish-live-app',
    async closeBundle() {
      await enqueue(async () => {
        const destination = path.join(target, 'dist')
        await mkdir(destination, { recursive: true })
        // Keep previous hashed assets so in-flight requests can finish safely.
        await copyWithRetry(path.join(staging, 'assets'), path.join(destination, 'assets'))
        await copyWithRetry(path.join(staging, 'index.html'), path.join(destination, 'index.html.next'))
        await rename(path.join(destination, 'index.html.next'), path.join(destination, 'index.html'))
        await writeFile(path.join(destination, '.live-update.next'), String(Date.now()))
        await rename(path.join(destination, '.live-update.next'), path.join(destination, '.live-update'))
        console.log('[live-app] 已发布到正在使用的 App，窗口将自动刷新。')
      })
    },
  }],
})
