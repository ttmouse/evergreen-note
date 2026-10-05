import { App, NewAddonParams, IAddon } from '../../engine/App'
import { after } from '../../engine/helper'
import { ItemNode, Item } from '../../interfaces/item'
import { Editor, Path, Node } from '../../slate.inc'
import { ItemTransforms } from '../../transforms/item'
import { isEmpty, notEmpty } from '../../utils/isEmpty'
import { mkid } from '../../utils/string/mkid'
import { ItemEditor } from '../EditorFactory/ItemEditor'
import { html2outline, isCodeblock, md2outline } from './helper'
import { isImgUrl, isUrl } from '../../utils/regexp'
import { ZERO_WIDTH_SPACE } from '../Strmap/Strmap'
import { recur } from '../../utils/recur'
import { TurndownService } from './turndown'
import { trim } from '../../utils/string/trim'
import { countStr } from '../../utils/string'
import { $t } from '../../../i18n'
import { filter } from 'lodash'
import { browser } from '@/slate-item/utils/browser'
import { copy } from '@/slate-item/utils/clipboard'
import { COPY_CUT_PREFIX } from '../Copy/Copy'

TurndownService.prototype.escape = ((html: string) => {
  return html
}) as any

export type ClipType =
  | 'fulljson'
  | 'image'
  | 'html'
  | 'markdown'
  | 'outline'
  | 'plain'
  | 'url'
  | 'iframe'
  | 'inline'
  | 'default'
  | 'ul'
  | 'codeblock'
  | 'cut'

export type ClipParams = {
  app: App
  type: ClipType
  editor: ItemEditor
  event: React.ClipboardEvent
  nativeEvent: ClipboardEvent
  clipData: any
}

export function createPasteAddon({ $ }: NewAddonParams) {
  class Paste implements IAddon {
    app!: App
    config = {}

    insertItems(editor: ItemEditor, items: ItemNode[]) {
      if (editor.selection) {
        const pathRef = Editor.pathRef(
          editor as any,
          editor.selection.anchor.path,
          {
            affinity: 'forward',
          }
        )
        let at = editor.selection.anchor.path
        if (!editor.itemSelection().isCollapsed) {
          editor.deleteRange(editor.selection)
          at = editor.itemPathPrev() as Path
        }
        ItemTransforms.insertNextItems(editor, {
          at,
          items,
          focus: true,
        })
        const p = pathRef.unref() as Path
        if (
          editor.itemHasNothing(p) &&
          editor.item(p).blockType !== 'divider'
        ) {
          editor.itemRemove(p)
        }
      }
    }

    methods: { [name in ClipType]?: (params: ClipParams) => void } = {
      fulljson: ({ editor, clipData, app }) => {
        let clipItems = JSON.parse(clipData) as UnitPersist[]
        if (!Array.isArray(clipItems)) {
          clipItems = [clipItems]
        }
        const cloneData = clipItems.map((item: UnitPersist) => {
          const newItem = Item.clone(item)
          return Item.make(newItem, { editor })
        })
        app.addons.paste.insertItems(editor, cloneData)
      },

      cut: ({ editor, clipData }) => {
        const clipItems = JSON.parse(clipData)
        const madeItems = clipItems.map((item: any) =>
          Item.make(item, { editor })
        )
        $.paste.insertItems(editor, madeItems)
        copy('')
      },

      plain: ({ editor, clipData }) => {
        // 处理版权尾巴
        function replaceCopyrightTail(text: string): string {
          const copyrightRegex = /作者：(\S+)\s+链接：(\S+)\s+来源：(\S+)\s+.+/
          const replacementTemplate = '[来源：$1($3)]($2)'
          return text.replace(copyrightRegex, replacementTemplate)
        }

        const mdStr = replaceCopyrightTail(clipData)

        // 当一个节点存在多行时，或者以 > 开头（Markdown的引述符）
        // 粘贴的文本就以软换行的形式粘贴
        if (
          (/\n/.test(editor.itemTextPlain()) ||
            editor.item().blockType === 'blockquote') &&
          mdStr.includes('\n')
        ) {
          const result = $.compat.convertItem({ ori: mdStr } as any, false)
          editor.insertFragment(result.leaves)
          return
        }

        const result = md2outline(mdStr, true)
        recur(result as any, (item: UnitPersist) => {
          const v2item = $.compat.convertItem(item as any)
          Object.assign(item, v2item)
        })

        if (editor.itemDepth() === 0) {
          const first = result.subitems.shift()
          editor.insertText(first?.ori ?? '')
          ItemTransforms.insertItems(editor, {
            at: editor.itemPath(),
            focus: true,
          })
        }

        result.subitems.forEach((item) => {
          ;(item as any).ky = mkid()
          const itemNode = Item.make(Item.resolvePkyAndWeight(item as any), {
            editor,
          })
          $.paste.insertItems(editor, [itemNode])
        })
      },

      // parse html <ul> to outline json
      ul: ({ editor, clipData, app }) => {
        const items = html2outline(clipData)
        items.forEach((item) => {
          ;(item as any).ky = mkid()
          const itemNode = Item.make(Item.resolvePkyAndWeight(item as any), {
            editor,
          })
          $.paste.insertItems(editor, [itemNode])
        })
      },

      url: ({ editor, clipData, app }) => {
        if (editor.itemSelection().isCollapsed) {
          const el = $.hyperlink.createElement({
            url: clipData,
            title: clipData,
          })
          editor.insertFragment([el, { text: ZERO_WIDTH_SPACE }])
        } else {
          const el = $.hyperlink.createElement({
            url: clipData,
            title: window.getSelection()!.toString(),
          })
          app.addons.inlines.wrap(editor, el)
          editor.insertFragment([{ text: ZERO_WIDTH_SPACE }])
        }
      },

      image: ({ editor, clipData, app }) => {
        const el = $.img?.createElement({
          src: clipData,
          title: '',
        })
        editor.insertFragment([el, { text: ZERO_WIDTH_SPACE }])
      },

      iframe: ({ editor, clipData: url }) => {
        const el = $.embedweb?.createElement({
          value: url,
        })
        editor.insertFragment([el, { text: ZERO_WIDTH_SPACE }])
      },

      codeblock({ editor, clipData }) {
        const el = $.codeblock.createElement({
          value: clipData,
        })
        editor.insertFragment([el, { text: ZERO_WIDTH_SPACE }])
      },
    }

    exec(params: ClipParams) {
      if (this.methods[params.type]) {
        return this.methods[params.type]!.call(this, params)
      }
    }

    onPaste(event: React.ClipboardEvent, editor: ItemEditor) {
      const { nativeEvent } = event
      if (!nativeEvent.clipboardData) {
        return
      }

      const { compat } = this.app.addons

      const sel = editor.itemSelection()
      if (sel.isMulti) {
        // 如果选中了多个节点，则在粘贴之前先删除选中的节点
        const pathRef = Editor.pathRef(editor, sel.anchor.path)
        editor.itemsBatch((_, { at }) => editor.itemRemove(at))
        ItemTransforms.insertPrevItems(editor, {
          at: pathRef.unref()!,
          focus: true,
        })
      }

      const params = {
        editor,
        event,
        nativeEvent,
        app: this.app,
      }

      let clipCut = nativeEvent.clipboardData.getData('text/cut')
      if (!clipCut) {
        const newText = nativeEvent.clipboardData.getData('text/plain')
        if (newText.startsWith(COPY_CUT_PREFIX)) {
          clipCut = newText.slice(COPY_CUT_PREFIX.length)
        }
      }
      if (!isEmpty(clipCut)) {
        return this.exec({
          ...params,
          type: 'cut',
          clipData: clipCut,
        })
      }

      const clipJson = nativeEvent.clipboardData.getData('text/fulljson')
      if (!isEmpty(clipJson)) {
        return this.exec({
          ...params,
          type: 'fulljson',
          clipData: clipJson,
        })
      }

      const fragment = nativeEvent.clipboardData.getData('text/fragment')
      if (!isEmpty(fragment)) {
        const nodes = JSON.parse(fragment) as Node[]
        if (!(nodes.length === 1 && !$.marks.hasMark(nodes[0]))) {
          nodes.forEach((node) => {
            if ('iky' in node) node.iky = mkid()
          })
          editor.insertFragment(nodes)
          return
        }
      }

      const clipHtml = nativeEvent.clipboardData.getData('text/html')

      const match = /<iframe\s+.*src=["'](.+?)["'].*?>/im.exec(clipHtml)
      if (match) {
        return this.exec({
          ...params,
          type: 'iframe',
          clipData: match[1],
        })
      }

      //clipHtml = clipHtml.replace(/<!\[if ppt\]>.+<!\[endif\]>/gims, '')
      // const msOffice = /Microsoft (Word|Excel|PowerPoint) \d+/i.test(clipHtml);

      const turn = new TurndownService()
      turn.addRule('h1', {
        filter: ['h1'],
        replacement(content: string) {
          return `# ${content}`
        },
      })
      turn.addRule('h2', {
        filter: ['h2'],
        replacement(content: string) {
          return `## ${content}`
        },
      })
      turn.addRule('h3', {
        filter: ['h3'],
        replacement(content: string) {
          return `### ${content}`
        },
      })
      turn.addRule('hr', {
        filter: ['hr'],
        replacement() {
          return '\n---\n'
        },
      })
      turn.addRule('keep-clean-table', {
        filter: ['table'],
        replacement(content, node) {
          const tableElement = node as HTMLElement
          // 定义一个清洗函数
          const cleanAttributes = (el: HTMLElement) => {
            // 1. 备份需要保留的样式
            const textAlign = el.style.textAlign
            const colSpan = el.getAttribute('colspan')
            const rowSpan = el.getAttribute('rowspan')
            // 2. 移除所有属性（class, style, node, 以及冗余的 tailwind 变量）
            while (el.attributes.length > 0) {
              el.removeAttribute(el.attributes[0].name)
            }
            // 3. 恢复关键属性
            if (textAlign && textAlign !== 'initial') {
              el.style.textAlign = textAlign
            }
            if (colSpan) el.setAttribute('colspan', colSpan)
            if (rowSpan) el.setAttribute('rowspan', rowSpan)
            // 4. 递归处理子元素 (thead, tbody, tr, th, td, strong, code 等)
            Array.from(el.children).forEach((child) =>
              cleanAttributes(child as HTMLElement)
            )
          }
          // 克隆节点以免影响原始 DOM
          const clonedTable = tableElement.cloneNode(true) as HTMLElement

          // 执行清洗
          cleanAttributes(clonedTable)
          // 返回清洗后的 outerHTML，前后加换行
          return '\n\n' + clonedTable.outerHTML + '\n\n'
        },
      })
      turn.remove(['script', 'style'])
      let markdown = turn.turndown(clipHtml)
      if (markdown.split('\n').length < 2) {
        markdown = markdown.replace(/^(#+|\*-\+)\s+/g, '')
      }

      // .replace(/<style.*?>.+?<\/style>/gims, '')
      // .replace(/<head.*?>.+?<\/head>/gims, '')
      // .replace(/<script.*?>.+?<\/script>/gims, '')
      // .replace(/<head.*?>.+?<\/head>/gims, '')
      // .replace(/<a .*?href=["'](.+?)["'].*?>(.+?)<\/a>/g, '[$2]($1)')
      // .replace(/<img .*?src=["'](.+?)["'].*?>/g, '![]($1)\n')
      // .replace(/<br>/g, '\n')
      // .replace(/<b.*?>([^\n]+?)<\/b>/g, '**$1**')
      // .replace(/<i.*?>([^\n]+?)<\/i>/g, '//$1//')
      // .replace(/<u.*?>([^\n]+?)<\/u>/g, '__$1__')
      // .replace(/<s.*?>([^\n]+?)<\/s>/g, '~~$1~~')
      // .replace(/<code.*?>([^\n]+?)<\/code>/g, '~~$1~~')
      // .replace(/<kbd.*?>([^\n]+?)<\/kbd>/g, '~~$1~~')
      // .replace(/<strong.*?>([^\n]+?)<\/strong>/g, '**$1**')
      // .replace(/<p>/g, '\n\n');
      // .replace(/<code.*language-js.*?>(.+?)<\/code>/igms, '```js\n$1\n```');

      // 当用户在 RoamRsearch、Workflowy 之类的大纲工具中复制时，
      // 这些工具会将大纲内容转换成 <ul> 标签写入剪贴板
      // if (/<ul.*?>|<ol.*?>/im.test(clipHtml)) {
      //   return this.exec({
      //     ...params,
      //     type: 'ul',
      //     clipData: clipHtml,
      //   });
      // }

      const markdownCanUse = notEmpty(trim(markdown))
      const textPlain = nativeEvent.clipboardData.getData('text/plain').trim()

      const plain =
        markdownCanUse &&
        (!browser.isMobile ||
          window.confirm('Would you like to paste as rich text?'))
          ? markdown
          : trim(textPlain)

      if (
        this.app.isAddonEnabled('codeblock') &&
        isCodeblock(plain) &&
        window.confirm($t`paste.is_codeblock`)
      ) {
        return this.exec({
          ...params,
          type: 'codeblock',
          clipData: plain,
        })
      }

      const iframeMatch = /<iframe\s+.*src=["'](.+?)["'].*?>/im.exec(plain)
      if (iframeMatch) {
        return this.exec({
          ...params,
          type: 'iframe',
          clipData: iframeMatch[1],
        })
      }

      if (isImgUrl(plain)) {
        return this.exec({
          ...params,
          type: 'image',
          clipData: plain,
        })
      }

      const textBeforeCaret = editor.itemTextBeforeCaret()

      if (isUrl(plain) && /\[.*?\]\($/.test(textBeforeCaret) === false) {
        return this.exec({
          ...params,
          type: 'url',
          clipData: plain,
        })
      }

      // 当选中的文本是一个url时，将选中的 url 与所粘贴文本一起创建一个链接
      if (!sel.isCollapsed) {
        editor.deleteRange(editor.selection!)
        if (!sel.isMulti) {
          const selectedText = editor.itemTextRange()
          if (isUrl(selectedText)) {
            editor.insertFragment([
              this.app.addons.hyperlink.createElement({
                url: selectedText,
                title: plain,
              }),
              { text: ZERO_WIDTH_SPACE },
            ])
            return
          }
        }
      }

      // 以纯文本形式粘贴的 JSON 字符串
      if (/^\{.+\}$/ms.test(trim(plain)) && !plain.startsWith('{{')) {
        try {
          const json = JSON.parse(plain)
          if (Item.isItem(json)) {
            return this.exec({
              ...params,
              type: 'fulljson',
              clipData: plain,
            })
          }
        } catch (e) {}
      }

      // 多行文本
      if (/\n/.test(plain)) {
        return this.exec({
          ...params,
          type: 'plain',
          clipData: plain,
        })
      }

      let nodes
      if (textBeforeCaret.endsWith('`')) {
        nodes = [{ text: plain }]
      } else {
        nodes = compat.convertText({} as any, plain)
      }
      editor.insertFragment(nodes)

      return false
    }

    addonRun() {
      const { eventHandler, paste } = this.app.addons
      after(eventHandler.create, (result, editor) => {
        return {
          ...result,
          onPaste: (event: React.ClipboardEvent) => {
            if (!paste.onPaste(event, editor)) {
              event.preventDefault()
            }
          },
        }
      })
    }
  }

  return new Paste()
}
