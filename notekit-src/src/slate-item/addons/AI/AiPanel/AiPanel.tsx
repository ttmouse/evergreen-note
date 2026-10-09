import { App, NewAddonParams, IAddon } from '../../../engine/App'
import { AiPanelComp } from './AiPanelComp'
import { aiPanelStore } from './AiPanelStore'
import { installAiWriteGuard } from './AiWriteGuard'
import { observer } from 'mobx-react'
import React, { useEffect, useRef, useState } from 'react'

/**
 * AI 面板的宿主：**自己占一列右栏**（500px，左侧一条细分隔线），不往 ExtArea 里塞。
 *
 * 为什么不复用 ExtArea：ExtArea 是「放若干笔记卡片的列表容器」（内部 items 循环 + 卡片样式），
 * 而 AI 面板是「一个占满高度的固定面板」。硬塞进列表容器要跟它的 flex-wrap / 卡片边框打架，
 * 且它的空态是 `return null`、折叠靠负 margin，语义不匹配。见方案 §7 的修订。
 *
 * 折叠：收起时整列隐藏（负 margin），面板自己有一个「收起」按钮 + mod+shift+9 热键。
 */
/**
 * 面板宽度：默认 500px，左缘拖拽可调（320–900px 夹取），持久化到 localStorage。
 */
const WIDTH_KEY = 'nk-ai-panel-width'
const loadWidth = () => {
  const n = parseInt(localStorage.getItem(WIDTH_KEY) || '', 10)
  return Number.isFinite(n) ? n : 500
}
const clampWidth = (n: number) => Math.max(320, Math.min(900, n))

const AiPanelHost = observer(() => {
  const [width, setWidth] = useState(loadWidth)
  const draggingRef = useRef(false)
  const hostRef = useRef<HTMLDivElement>(null)
  /**
   * 视口夹取：只在「父级给出的高度超出窗口」时才介入。
   *
   * 为什么需要：面板是 flex 行里 align-items:stretch 的成员，高度由父级决定。
   * 一旦某个祖先被内容抻得比窗口高（实测在某些布局状态下会发生），
   * 面板就会跟着变高 → 底部的输入区被排到窗口外 → 表现为「输入框完全不见、底下空白」。
   * 正常情况父级高度 == 可用高度，这里返回 null，一点行为都不变。
   */
  const [cap, setCap] = useState<number | null>(null)
  useEffect(() => {
    const el = hostRef.current
    if (!el) return
    const compute = () => {
      const rect = el.getBoundingClientRect()
      const avail = window.innerHeight - rect.top
      const parentH = el.parentElement?.getBoundingClientRect().height ?? avail
      setCap(parentH > avail + 1 ? Math.max(200, Math.floor(avail)) : null)
    }
    compute()
    window.addEventListener('resize', compute)
    const ro = new ResizeObserver(compute)
    if (el.parentElement) ro.observe(el.parentElement)
    ro.observe(el)
    return () => {
      window.removeEventListener('resize', compute)
      ro.disconnect()
    }
  }, [])

  // 拖拽期间挂全局监听（move 挂在 window 上，出面板也不中断）；松手即持久化。
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!draggingRef.current) return
      e.preventDefault()
      setWidth(clampWidth(window.innerWidth - e.clientX))
    }
    const onUp = () => {
      if (!draggingRef.current) return
      draggingRef.current = false
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      setWidth((w) => {
        localStorage.setItem(WIDTH_KEY, String(clampWidth(w)))
        return w
      })
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  }, [])

  if (!aiPanelStore.open) return null
  return (
    <div
      ref={hostRef}
      className="ai-panel-area"
      data-height-cap={cap ?? 'none'}
      style={{
        flex: `0 0 ${width}px`,
        width,
        height: cap ?? '100%',
        // 这一层是面板的宿主：不许被父级顶高、也不许超出父级 ——
        // 否则标题栏那点高度就能把底部的输入框推出窗口（且窗口本身不会滚）。
        // cap 有值时（父级比窗口还高）连 100% 都不信，直接用实测可用高度。
        minHeight: 0,
        maxHeight: cap ?? '100%',
        overflow: 'hidden',
        borderLeft: '1px solid var(--nk-line)',
        background: 'var(--nk-surface)',
        display: 'flex',
        flexDirection: 'column',
        minWidth: 0,
        position: 'relative',
      }}
    >
      {/* 左缘拖拽把手：4px 命中区，hover/拖拽时显示强调色细条 */}
      <div
        title="拖拽调整宽度"
        onMouseDown={(e) => {
          e.preventDefault()
          draggingRef.current = true
          document.body.style.cursor = 'col-resize'
          document.body.style.userSelect = 'none'
        }}
        onDoubleClick={() => {
          setWidth(500)
          localStorage.setItem(WIDTH_KEY, '500')
        }}
        style={{
          position: 'absolute',
          left: -2,
          top: 0,
          bottom: 0,
          width: 5,
          cursor: 'col-resize',
          zIndex: 10,
        }}
        onMouseEnter={(e) => (e.currentTarget.firstChild as HTMLElement).style.opacity = '1'}
        onMouseLeave={(e) => (e.currentTarget.firstChild as HTMLElement).style.opacity = '0'}
      >
        <i
          style={{
            position: 'absolute',
            left: 2,
            top: 0,
            bottom: 0,
            width: 1,
            background: 'var(--nk-accent)',
            opacity: 0,
            transition: 'opacity .15s',
            display: 'block',
          }}
        />
      </div>
      <AiPanelComp />
    </div>
  )
})

export function createAiPanelAddon({ app, $ }: NewAddonParams) {
  class AiPanel implements IAddon {
    app!: App
    config = {}
    private pushed = false

    open() {
      aiPanelStore.open = true
      // 懒挂载：不依赖 addonRun 的时序（启动期一旦有别的 addon 抛错，后续 addonRun 就跑不到）。
      if (!this.pushed) {
        this.pushed = true
        $.ui.pushComponent(AiPanelHost as any, 1e9)
      }
    }

    close() {
      aiPanelStore.open = false
    }

    isOpen() {
      return aiPanelStore.open
    }

    toggle() {
      if (aiPanelStore.open) this.close()
      else this.open()
    }

    addonRun() {
      ;($ as any).aiPanel = this
      ;($ as any).aiPanel.store = aiPanelStore  // 调试/测试句柄
      installAiWriteGuard($, aiPanelStore)

      // 右上角工具条图标（与 DateTool/Andy 同一挂点），点击开/合面板
      ;($.main as any).addExtraCommands({
        aiPanel: {
          title: 'AI（⌥⇧9）',
          icon: 'svg_ai',
          onClick: () => this.toggle(),
        },
      })
      // 必须在首次渲染前挂上：contentComponents 只在 app.restart() 时被 map 一次，
      // 运行期再 push 不会重建组件树（且 refresh() 会重跑 addon、撞重复注册）。
      if (!this.pushed) {
        this.pushed = true
        $.ui.pushComponent(AiPanelHost as any, 1e9)
      }
    }

    addonCommands() {
      return {
        aiPanel: {
          title: 'AI',
          hotkey: 'mod+shift+9',
          context: 'global',
          handle: () => this.open(),
        },
      } as any
    }
  }

  return { aiPanel: new AiPanel() }
}

export default createAiPanelAddon
