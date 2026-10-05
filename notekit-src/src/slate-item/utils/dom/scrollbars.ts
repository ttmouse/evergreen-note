/** Capture also covers nested containers, dialogs and dynamically mounted views. */
export function installScrollbars() {
  const timers = new Map<HTMLElement, ReturnType<typeof setTimeout>>()
  const onScroll = (event: Event) => {
    const target = event.target === document ? document.scrollingElement : event.target
    if (!(target instanceof HTMLElement)) return
    const previous = timers.get(target)
    if (previous !== undefined) clearTimeout(previous)
    target.setAttribute('data-scrollbar-active', '')
    timers.set(target, setTimeout(() => {
      target.removeAttribute('data-scrollbar-active')
      timers.delete(target)
    }, 900))
  }
  document.addEventListener('scroll', onScroll, { capture: true, passive: true })
  return () => {
    document.removeEventListener('scroll', onScroll, true)
    timers.forEach((timer, target) => {
      clearTimeout(timer)
      target.removeAttribute('data-scrollbar-active')
    })
    timers.clear()
  }
}
