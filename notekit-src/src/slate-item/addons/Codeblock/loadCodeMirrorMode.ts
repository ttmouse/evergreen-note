/** Syntax highlighting is optional; missing modes must not hide the code. */
export async function loadCodeMirrorMode(
  codeblock: { loadMode: (mode: string) => Promise<unknown> },
  mode?: string
): Promise<boolean> {
  if (!mode || mode === 'text/plain') return false
  try {
    if (mode === 'htmlembedded') await codeblock.loadMode('multiplex')
    await codeblock.loadMode(mode)
    return true
  } catch {
    return false
  }
}
