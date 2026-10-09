import { cover } from '../../../engine/helper'
import type { AiPanelStore } from './AiPanelStore'

type Snap = { ky: string; existed: boolean; data: unknown; via: 'save' | 'delete' }

/**
 * 写入层守卫（「乙」的安全网）。
 *
 * 依据（2026-10-09 实测）：agent 经 ev 的一切写入最终都走渲染层 `$.dbMemory.saveItem` /
 * `deleteItem`（desktop/note-command.cjs），所以在这里拦一次，就能拿到"改动前"的完整节点。
 *
 * 纪律：
 *  - 只在 AI 回合进行中（store.busy）才快照，用户自己的编辑不进撤销集。
 *  - 每个 ky 每回合只记第一次（最初的形态），回放才是"回到回合开始前"。
 *  - 撤销 = 逆向回放：删掉新建的 → 复原被删的 → 复原被改的（整条 data 回写，
 *    对齐 handle-sync2 的整条覆盖语义——只传 {ky,pky} 会清空节点）。
 */
export function installAiWriteGuard($: any, store: AiPanelStore) {
  const dbm = $.dbMemory
  if (!dbm || typeof dbm.saveItem !== 'function') return

  // 安装前捕获原函数（本仓教训：包装必须用安装前的局部引用回调，否则无穷递归）。
  // 注意：必须用仓库的 cover() 安装，不能直接赋值——cover 会给包装函数盖上 `.addon` 戳，
  // 后续 addon（如 Script.tsx 的 after($.dbMemory.saveItem)）依赖这个戳做校验与链式调用；
  // 直接赋值的裸函数没有戳，会让整个应用启动失败（"Only addon's methods can be overrided"）。
  const rawSave = dbm.saveItem
  const rawDelete = dbm.deleteItem

  const snaps = new Map<string, Snap>()

  const snapSave = (ky: unknown) => {
    if (!store.busy || !ky || typeof ky !== 'string') return
    if (snaps.has(ky)) return
    let existed = false
    let data: unknown = null
    try {
      const prior = dbm.getItem(ky)
      existed = !!prior?.ky
      if (existed) data = JSON.parse(JSON.stringify(prior))
    } catch {}
    snaps.set(ky, { ky, existed, data, via: 'save' })
    store.snapCount = snaps.size
  }

  const snapDelete = (ky: unknown, isRecur: boolean) => {
    if (!store.busy || !ky || typeof ky !== 'string') return
    if (!snaps.has(ky)) {
      let existed = false
      let data: unknown = null
      try {
        const prior = dbm.getItem(ky)
        existed = !!prior?.ky
        if (existed) data = JSON.parse(JSON.stringify(prior))
      } catch {}
      snaps.set(ky, { ky, existed, data, via: 'delete' })
    }
    // 递归删除时子节点也会消失，一并记下
    if (isRecur) {
      try {
        const subs = dbm.getSubitems?.(ky, { isRecur: true, maxDepth: 6 }) || []
        for (const s of subs) {
          const sky = s?.ky
          if (!sky || snaps.has(sky)) continue
          const prior = dbm.getItem(sky)
          if (prior?.ky) snaps.set(sky, { ky: sky, existed: true, data: JSON.parse(JSON.stringify(prior)), via: 'delete' })
        }
      } catch {}
    }
    store.snapCount = snaps.size
  }

  cover(dbm.saveItem, function (this: unknown, item: any, options: any) {
    try {
      snapSave(item?.ky)
    } catch {}
    return rawSave.apply(dbm, [item, options])
  } as any)

  cover(dbm.deleteItem, function (this: unknown, ky: any, options: any) {
    try {
      snapDelete(ky, options?.isRecur === true)
    } catch {}
    return rawDelete.apply(dbm, [ky, options])
  } as any)

  async function undoTurn() {
    if (snaps.size === 0 || store.undoing) return 0
    store.undoing = true
    const list = [...snaps.values()]
    let n = 0
    try {
      // ① 删掉本回合新建的
      for (const s of list) {
        if (!s.existed) {
          try {
            rawDelete.call(dbm, s.ky, { isRecur: true })
            n++
          } catch {}
        }
      }
      // ② 复原被删的（同样要求完整快照）
      for (const s of list) {
        if (s.via === 'delete' && s.existed && s.data) {
          const d = s.data as any
          const looksComplete = d && d.ky && (typeof d.ori === 'string' || Array.isArray(d.leaves))
          if (!looksComplete) {
            console.warn('[AiPanel] 撤销跳过不完整快照（防止清空节点）：', s.ky, d)
            continue
          }
          try {
            rawSave.call(dbm, d)
            n++
          } catch {}
        }
      }
      // ③ 复原被改的（最后做，保证最终态=回合前的形态）
      //    护栏：快照必须是"完整的节点"才允许回写——若快照是未加载完整的空壳
      //    （缺 ori 且无 leaves），回写会把活节点清空。此时宁可不还原并保留告警。
      for (const s of list) {
        if (s.via === 'save' && s.existed && s.data) {
          const d = s.data as any
          const looksComplete = d && d.ky && (typeof d.ori === 'string' || Array.isArray(d.leaves))
          if (!looksComplete) {
            console.warn('[AiPanel] 撤销跳过不完整快照（防止清空节点）：', s.ky, d)
            continue
          }
          try {
            rawSave.call(dbm, d)
            n++
          } catch {}
        }
      }
      snaps.clear()
      store.snapCount = 0
    } finally {
      store.undoing = false
    }
    return n
  }

  function beginTurn() {
    snaps.clear()
    store.snapCount = 0
  }

  store.attachUndo({ undoTurn, beginTurn, count: () => snaps.size })
  return { undoTurn, beginTurn }
}

export default installAiWriteGuard
