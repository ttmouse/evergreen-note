#!/usr/bin/env node
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { parseArgs } from 'node:util'
import { spawn } from 'node:child_process'

// 对外只暴露 4 个动词：get / add / set / del（外加 status）。
// get 三合一：--date 读日记、--ky 读节点、--query 搜索。
// 内部映射到服务端动作：read/get/search/append/edit/delete；旧命令名保留为别名。
const VERBS = { get: 'get', add: 'append', set: 'edit', del: 'delete' }
const ALIASES = { read: 'get', append: 'add', edit: 'set', delete: 'del', search: 'get', rm: 'del', ls: 'get' }

try {
  const { values, positionals } = parseArgs({ allowPositionals: true, options: {
    profile: { type: 'string' }, date: { type: 'string' }, db: { type: 'string' },
    title: { type: 'string' }, input: { type: 'string' }, key: { type: 'string' }, help: { type: 'boolean' },
    query: { type: 'string' }, limit: { type: 'string' }, ky: { type: 'string' },
    topic: { type: 'string' }, tag: { type: 'string' }, under: { type: 'string' },
    depth: { type: 'string' }, recurse: { type: 'boolean' }, h: { type: 'boolean', short: 'h' },
  } })
  const verb = positionals[0]
  if (values.help || values.h || !verb || verb === 'help' || verb === '--help') {
    console.log(`用法：node tools/note-command.mjs <命令> [参数]

命令（4 个动词 + status/start）：
  status                     当前知识库与保存模式
  get    --date 2026-10-05   读日记
         --ky 节点ID [--depth 0-5]   读任意节点及子树
         --query 关键词 [--limit 50] 全库搜索
         --topic 主题名 [--depth 0-5]  读主题页及其内容
         --tag 标签名 [--limit 50]     列出带该标签的条目
  add    --date 2026-10-05 --title 标题 --input 条目.json [--key 防重标识]
         (--topic 主题名 或 --under 节点ID 可代替 --date，追加到任意页面)
  start                      启动/唤起应用并等待就绪
  set    --input edits.json  条目：[{"ky":"节点ID","text":"新文字","checkbox":true?}]
  del    --ky 节点ID [--recurse]     也可 --input ["节点ID",...]

通用：--db 知识库ID（默认当前库）、--profile profile目录。应用需已打开，命令不会启动应用。
条目.json 格式：[{"text":"内容","checkbox":true}]，1-100 条。旧名 read/append/search/edit/delete 可用。`)
    process.exit(0)
  }
  const action = verb === 'status' ? 'status' : verb === 'start' ? 'start' : verb in VERBS ? VERBS[verb] : ALIASES[verb]
  if (!action) throw new Error('仅支持 status/get/add/set/del')
  const profile = values.profile || path.join(os.homedir(), 'Library/Application Support/NotekitDev')

  // start：启动/唤起应用并等待就绪（status 失败时清理残留 SingletonLock 再拉起）
  if (action === 'start') {
    // 应用每次启动会轮换 token，探针每轮都要重读 note-command.json。
    const probe = async () => {
      try {
        const descriptor = JSON.parse(await fs.readFile(path.join(profile, 'note-command.json'), 'utf8'))
        const url = new URL(descriptor.url)
        if (url.protocol !== 'http:' || url.hostname !== '127.0.0.1' || url.pathname !== '/api/note-command') return false
        const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${descriptor.token}` }, body: JSON.stringify({ action: 'status' }), signal: AbortSignal.timeout(5000) })
        return response.ok
      } catch { return false }
    }
    const started0 = performance.now()
    if (await probe()) { console.log(JSON.stringify({ ready: true, alreadyRunning: true, elapsedMs: Math.round(performance.now() - started0) })); process.exit(0) }
    const lockPath = path.join(profile, 'SingletonLock')
    try {
      const target = await fs.readlink(lockPath)
      const m = target.match(/(\d+)\s*$/)
      if (m) {
        let alive = true
        try { process.kill(Number(m[1]), 0) } catch { alive = false }
        if (!alive) await fs.unlink(lockPath).catch(() => {})
      }
    } catch {}
    const app = process.env.EVERGREEN_APP || path.join(os.homedir(), 'Projects/roamedit/notekit-src/build/Evergreen note.app')
    // open 偶发竞态会静默失败：未就绪时每 15 秒重发一次 open，最多等 60 秒。
    const deadline = Date.now() + 60000
    let lastOpen = 0
    while (Date.now() < deadline) {
      if (Date.now() - lastOpen >= 15000) {
        spawn('open', [app], { detached: true, stdio: 'ignore' }).unref()
        lastOpen = Date.now()
      }
      await new Promise(resolve => setTimeout(resolve, 2000))
      if (await probe()) { console.log(JSON.stringify({ ready: true, started: true, elapsedMs: Math.round(performance.now() - started0) })); process.exit(0) }
    }
    throw new Error('启动超时（60 秒内未就绪）；请手动打开应用查看')
  }

  const descriptor = JSON.parse(await fs.readFile(path.join(profile, 'note-command.json'), 'utf8'))
  const url = new URL(descriptor.url)
  if (url.protocol !== 'http:' || url.hostname !== '127.0.0.1' || url.pathname !== '/api/note-command') throw new Error('本地命令地址无效')
  const call = async input => {
    const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${descriptor.token}` }, body: JSON.stringify(input), signal: AbortSignal.timeout(25000) })
    const result = await response.json()
    if (!response.ok) throw new Error(result.error || `HTTP ${response.status}`)
    return result
  }
  const started = performance.now()
  const status = await call({ action: 'status' })
  let result = status
  if (verb !== 'status') {
    const input = { action, dbid: values.db || status.dbid }
    if (action === 'get') {
      if (values.date) input.action = 'read'
      else if (values.query) input.action = 'search'
      else if (values.topic) input.action = 'topic'
      else if (values.tag) input.action = 'tag'
      else if (!values.ky) throw new Error('get 需要 --date、--ky、--query、--topic 或 --tag 之一')
    }
    if (action === 'append' && !values.topic && !values.under) {
      if (!values.date) throw new Error('add 需要 --date，或改用 --topic/--under 指定父页面')
    }
    if (['read', 'append'].includes(input.action) && values.date) {
      input.date = values.date
    }
    if (action === 'append') {
      if (values.topic) input.topicName = values.topic
      if (values.under) input.under = values.under
      if (!values.title || !values.input) throw new Error('add 需要 --title 和 --input')
      input.title = values.title
      input.blocks = JSON.parse(await fs.readFile(values.input, 'utf8'))
      input.requestId = createHash('sha256').update(values.key || JSON.stringify(input)).digest('hex')
    }
    if (input.action === 'search') {
      input.query = values.query
      if (values.limit !== undefined) {
        const limit = Number(values.limit)
        if (!Number.isInteger(limit) || limit < 1 || limit > 200) throw new Error('--limit 需为 1-200 整数')
        input.limit = limit
      }
    }
    if (input.action === 'get' && !values.date && !values.query) {
      input.ky = values.ky
      if (values.depth !== undefined) {
        const depth = Number(values.depth)
        if (!Number.isInteger(depth) || depth < 0 || depth > 5) throw new Error('--depth 需为 0-5 整数')
        input.depth = depth
      }
    }
    if (input.action === 'topic') {
      input.name = values.topic
      if (values.depth !== undefined) {
        const depth = Number(values.depth)
        if (!Number.isInteger(depth) || depth < 0 || depth > 5) throw new Error('--depth 需为 0-5 整数')
        input.depth = depth
      }
    }
    if (input.action === 'tag') {
      input.tag = values.tag
      if (values.limit !== undefined) {
        const limit = Number(values.limit)
        if (!Number.isInteger(limit) || limit < 1 || limit > 200) throw new Error('--limit 需为 1-200 整数')
        input.limit = limit
      }
    }
    if (action === 'edit') {
      if (!values.input) throw new Error('set 需要 --input 条目.json')
      input.items = JSON.parse(await fs.readFile(values.input, 'utf8'))
    }
    if (action === 'delete') {
      input.recurse = values.recurse === true
      if (values.input) input.kys = JSON.parse(await fs.readFile(values.input, 'utf8'))
      else if (values.ky) input.kys = [values.ky]
      else throw new Error('del 需要 --ky 节点ID 或 --input ["节点ID"]')
    }
    result = await call(input)
  }
  console.log(JSON.stringify({ ...result, elapsedMs: Math.round(performance.now() - started) }, null, 2))
} catch (error) {
  console.error('笔记命令失败：' + error.message + '。请确认原应用已打开并已加载笔记；重试追加时保留相同内容或 --key。')
  process.exitCode = 1
}
