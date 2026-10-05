let autoId = 0
export const createTmpDom = (id: string | null = null): HTMLElement => {
  const theId = id ?? `div-tmp-${autoId++}`
  const found = document.getElementById(theId)
  if (found) {
    return found
  }

  let ele = document.createElement('div')
  Object.assign(ele.style, {
    left: '-10000px',
    position: 'absolute',
    'z-index': 100,
  })
  ele.id = theId
  document.body.appendChild(ele)
  const t = setInterval(() => {
    if (ele.childElementCount < 1) {
      document.body.removeChild(ele)
      ele = undefined as any
      clearTimeout(t)
    }
  }, 1000)
  return ele
}
