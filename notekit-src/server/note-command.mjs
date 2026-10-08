import { randomUUID } from 'node:crypto'

const pending = new Map()
process.on('message', message => {
  if (message?.kind !== 'note-command-result') return
  const entry = pending.get(message.id)
  if (!entry) return
  pending.delete(message.id)
  clearTimeout(entry.timer)
  message.error ? entry.reject(new Error(message.error)) : entry.resolve(message.result)
})

// 渲染层返回 saved 的动作有三种形状：append 带 groupKey/blockKeys，
// edit 带 itemKeys，delete 带 deleted。逐个核对已写进 SQLite，防止
// IPC 回报成功但落库缺失；没有 saved 的只读动作直接放行。
export function verifySaved(result, get) {
  if (!result?.saved) return
  const keys = result.groupKey != null ? [result.groupKey, ...(result.blockKeys || [])]
    : result.topicKey != null ? [result.topicKey]
    : Array.isArray(result.itemKeys) ? result.itemKeys
    : Array.isArray(result.deleted) ? result.deleted
    : null
  if (!keys) throw new Error('笔记落库核对失败：返回结果缺少条目标识，请稍后重试')
  if (keys.some(key => !get(result.dbid, 'node', key))) throw new Error('笔记落库核对失败，追加请用同一请求标识重试')
}

export function callNoteCommand(input) {
  if (!process.send || !process.connected) return Promise.reject(new Error('该服务没有连接到桌面应用'))
  const id = randomUUID()
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(id)
      reject(new Error('笔记操作超时；请用相同请求标识重试，避免重复追加'))
    }, 20000)
    pending.set(id, { resolve, reject, timer })
    process.send({ kind: 'note-command', id, input }, error => {
      if (error && pending.has(id)) { pending.delete(id); clearTimeout(timer); reject(error) }
    })
  })
}
