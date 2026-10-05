export function getSelectionRect() {
  const rect = document.getSelection()?.getRangeAt(0).getBoundingClientRect()
  if (rect) {
    return {
      x: rect.left,
      y: rect.top,
      width: rect.width,
      height: rect.height,
      top: rect.top,
      bottom: rect.bottom,
      left: rect.left,
      right: rect.right,
    }
  }
  return null
}
