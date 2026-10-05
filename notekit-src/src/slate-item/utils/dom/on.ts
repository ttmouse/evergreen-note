type Listener = (evt: any) => void
export const on = (type: string, selector: string, handler: Listener) => {
  document.addEventListener(type, (e: any) => {
    const target = e.target as HTMLElement
    if (target.matches(selector)) {
      handler(e)
    }
  })
}
