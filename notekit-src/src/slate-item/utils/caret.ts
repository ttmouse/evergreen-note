import { getSelectionRect } from './dom/getSelectionRect'

export const caretGetCoordinates = () => {
  const sel = window.getSelection()
  if (sel?.rangeCount) {
    const range = sel.getRangeAt(0)
    const rect = range.getBoundingClientRect()
    return {
      top: rect.top,
      left: rect.left,
      height: rect.height,
      width: rect.width,
    }
  }
  return null
}

export const caretMoveToEnd = (el: HTMLTextAreaElement | HTMLInputElement) => {
  el.focus()
  el.setSelectionRange(el.value.length, el.value.length)
}

export const caretInsertText = (text: string) => {
  const sel = window.getSelection()
  if (sel?.rangeCount) {
    const range = sel.getRangeAt(0)
    range.deleteContents()
    range.insertNode(document.createTextNode(text))
  }
}

export const isCaretAtFirstLine = (ele: HTMLElement): boolean => {
  const sel = window.getSelection()
  if (sel?.rangeCount) {
    const range = sel.getRangeAt(0)
    const rect = range.getBoundingClientRect()
    return rect.top === ele.getBoundingClientRect().top
  }
  return false
}

export const isCaretAtLastLine = (ele: HTMLElement): boolean => {
  const sel = window.getSelection()
  if (sel?.rangeCount) {
    const range = sel.getRangeAt(0)
    const rect = range.getBoundingClientRect()
    return rect.bottom === ele.getBoundingClientRect().bottom
  }
  return false
}

export function setCaretPos(el: HTMLElement, pos: number) {
  const range = document.createRange()
  const sel = window.getSelection()
  range.setStart(el.childNodes[0], pos)
  range.collapse(true)
  sel?.removeAllRanges()
  sel?.addRange(range)
}

export function moveCaretToNextChar() {
  const sel = window.getSelection()
  if (sel?.rangeCount) {
    const range = sel.getRangeAt(0)
    range.setStart(range.startContainer, range.startOffset + 1)
    range.collapse(true)
    sel?.removeAllRanges()
    sel?.addRange(range)
  }
}

export function moveCaretToX(x: number) {
  let i = 0
  ;(document.body.style as any)['caret-color'] = 'transparent'
  while (Math.abs(getSelectionRect()!.left - x) > 20 && i < 5000) {
    moveCaretToNextChar()
    i += 1
  }
  ;(document.body.style as any)['caret-color'] = ''
}
