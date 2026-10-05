import React from 'react'

/**
 * 哨兵滚入视口即视为「加载完成」，用于滚动到底再渲染下一段内容。
 *
 * `enabled` 为 false 时立即完成，不再挂占位元素——浮窗/对话框里只要当前这一篇。
 *
 * 另外，IntersectionObserver 只在「相交状态发生变化」时回调：如果首次观测时
 * 容器已经贴底（浮窗可视高度小于哨兵高度、或内容不足以产生滚动），哨兵可能
 * 在回调到达时已越过视口，导致 loading 永远停在 true，底部留下一个 500px 的
 * 空占位。挂载后主动测一次几何位置兜底。
 */
export function useScrollLoad(
  ref: React.RefObject<HTMLElement>,
  enabled = true,
) {
  const [loading, setLoading] = React.useState(enabled)
  React.useEffect(() => {
    if (!enabled) {
      setLoading(false)
      return () => {}
    }
    const el = ref.current
    if (!el) {
      return () => {}
    }
    let done = false
    const finish = () => {
      if (done) return
      done = true
      setLoading(false)
    }

    const observer = new IntersectionObserver((entries, ob) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          finish()
          ob.unobserve(entry.target)
        }
      })
    })
    observer.observe(el)

    // 兜底：首次观测时哨兵已经在视口内，或最近的可滚动祖先已经贴底。
    const findScroller = (): HTMLElement | null => {
      let node = el.parentElement
      while (node && node !== document.body) {
        const cs = getComputedStyle(node)
        if (
          /auto|scroll/.test(cs.overflowY) &&
          node.scrollHeight > node.clientHeight
        ) {
          return node
        }
        node = node.parentElement
      }
      return null
    }
    const checkNow = () => {
      if (done) return
      const rect = el.getBoundingClientRect()
      const viewportH =
        window.innerHeight || document.documentElement.clientHeight
      if (rect.top < viewportH && rect.bottom > 0) {
        finish()
        return
      }
      const scroller = findScroller()
      if (
        scroller &&
        scroller.scrollHeight - scroller.clientHeight - scroller.scrollTop <= 1
      ) {
        finish()
      }
    }
    const raf = requestAnimationFrame(checkNow)

    return () => {
      cancelAnimationFrame(raf)
      observer.disconnect()
    }
  }, [ref, enabled])
  return loading
}
