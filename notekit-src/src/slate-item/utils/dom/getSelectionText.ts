export function getSelectionText() {
  return window.getSelection()?.toString() || '';
}
