import type { KyString } from '../../interfaces/unit'

/**
 * 右栏（ExtArea）里可以放的东西。
 *
 * 说明：这个文件此前**不存在**，而 `ExtArea.tsx:9` 一直在 import 它——
 * 之所以没报错，只是因为 `ExtAreaItem` 仅出现在类型标注里、被 esbuild 当类型抹掉了。
 * 属于"靠巧合活着"的悬空引用，这里补上真身，并顺带留出 AI 面板的挂载位。
 */
export type ExtAreaItem =
  | { type: 'topic'; key: KyString }
  | { type: 'item'; key: KyString }
  /** AI 面板：整个右栏就一块，key 固定 */
  | { type: 'ai'; key: 'ai-panel' }
