import React from 'react'
import { debounce } from 'lodash'
import { cls } from '../../styles'
import { ElementComponentProps } from '../EditorView/EditorView'
// import { EditorView as CodeMirrorView, basicSetup } from 'codemirror';
import { useAddons } from '../../hooks/useAddons'
import { useItem } from '../../hooks/useItem'
import { loadScript } from '../../utils/dom/loadScript'
import { loadCss } from '../../utils/dom/loadCss'
import { InlineOuterComp } from '../Inlines/InlineOuterComp'
import { useAwait } from '../../hooks/useAwait'
import { useEditor } from '../../hooks/useEditor'
import './codeblock.less'
import { ItemTransforms } from '../../transforms/item'
import { Editor, Node, Transforms, ReactEditor } from '../../slate.inc'
import { CodeblockProps } from './CodeblockProps'
import { ZERO_WIDTH_SPACE } from '../Strmap/Strmap'
import { isEmpty } from '../../utils/isEmpty'
import { LangInfo, langMaps } from './langMaps'
import { DropdownComp } from '../../components/Dropdown/Dropdown'
import { CodeblockElement } from './Codeblock'

const langsStyle = [
  cls`
    position: absolute !important;
    right: 10px;

    top: 15px;
    z-index: 10000;
  `,
].join(' ')
export function LangsMenu(props: {
  id: string
  value: string
  onChange: (lang: LangInfo) => void
}) {
  const { id, onChange, value } = props
  const $ = useAddons()
  const list = $.codeblock.getLanguages()
  return (
    <DropdownComp
      value={isEmpty(value) ? 'javaScript' : value}
      name={id}
      onSelect={onChange}
      subitems={list}
      filterable
      className={[langsStyle, 'codeblock-langs-menu'].join(' ')}
    />
  )
}

export const modesLoaded = ['javascript', 'css', 'markdown'];

function getMime(langObj: LangInfo) {
  if (langObj.mime) {
    return langObj.mime
  } else if (langObj.mimes) {
    return langObj.mimes[0]
  } else {
    return `text/x-${langObj.mode}`
  }
}

function getMode(mode: string, langName?: string) {
  if (langName) {
    for (const key in langMaps) {
      if (langMaps[key].langName === langName) {
        return { name: langMaps[key].mode, mime: getMime(langMaps[key]) }
      }
    }
  }
  return mode in langMaps ? { name: langMaps[mode].mode, mime: getMime(langMaps[mode]) } : { name: mode }
}

export function CodeMirror5Comp(
  props: ElementComponentProps<CodeblockElement>
) {
  const ref = React.useRef<HTMLDivElement>(null)
  const $ = useAddons()
  const slateEditor = useEditor()
  const item = useItem()

  const { element } = props
  const { iky } = element as any
  const langMode = element.codeBlockMode ?? element.mode
  const langValue = element.codeBlockText ?? element.value
  let langName = element.codeBlockName ?? element.langName
  if (isEmpty(langName)) {
    langName = 'javascript'
  }

  const [value, setValue] = React.useState<string>(langValue)
  const [cm, setCm] = React.useState<any>(null)
  const lineNumbers = true

  useAwait(async () => {
    await loadScript('js/codemirror/lib/codemirror.min.js')

    const mode = getMode(langMode, langName)
    const opt: CodeblockProps = {
      ...$.codeblock.defaultOptions,
      autofocus: Date.now() - $.codeblock.autoTimer < 100,
      lineNumbers,
      mode: mode.mime ?? mode.name,
      nkMode: mode.name,
      value,
    }

    if (!modesLoaded.includes(opt.nkMode ?? opt.mode)) {
      modesLoaded.push(opt.nkMode ?? opt.mode)
    }

    const srcList = [
      loadCss('js/codemirror/lib/codemirror.css'),
      ...modesLoaded.map(
        (mode) => $.codeblock.loadMode(mode)
      ),
      $.codeblock.loadTheme(opt.theme ?? 'mdn-like'),
    ]

    if (opt.nkMode === 'htmlembedded') {
      srcList.push($.codeblock.loadMode('multiplex'))
    }

    await Promise.all(srcList)

    const { CodeMirror } = window as any

    if (!ref.current) {
      return
    }
    ref.current.innerHTML = ''

    const codeMirror = CodeMirror(ref.current, opt)
    $.codeblock.setTheme(codeMirror)
    setCm(codeMirror)

    codeMirror.on('change', () => {
      const content = codeMirror.getValue()

      // 临时屏蔽 setBaseAndExtent
      const originalSetBaseAndExtent = window.getSelection()!.setBaseAndExtent.bind(window.getSelection())
      window.getSelection()!.setBaseAndExtent = () => {}
      
      $.inlines.setProps(slateEditor, item.GetSlPath(), {
        value: content,
        mode: opt.nkMode ?? opt.mode,
        langName,
        iky,
      } as any)
      
      // 还原
      Promise.resolve().then(() => {
        window.getSelection()!.setBaseAndExtent = originalSetBaseAndExtent
      })

      setValue(content)
    })

    codeMirror.on('keydown', (_: any, e: KeyboardEvent) => {
      if (e.shiftKey && e.key === 'Enter') {
        const cbPath = ReactEditor.findPath(slateEditor as any, element)
        const [nextNode, nextPath] = Editor.next(slateEditor as any, {
          at: cbPath,
        })!
        const str = Node.string(nextNode).trim()
        if (str.length < 1 || str === ZERO_WIDTH_SPACE) {
          ItemTransforms.insertNextItems(slateEditor, {
            at: item.GetSlPath(),
            focus: true,
          })
        } else {
          ReactEditor.focus(slateEditor as any)
          Transforms.select(slateEditor, { path: nextPath, offset: 0 })
        }
        e.preventDefault()
      } else if (e.key === 'Backspace' || e.key === 'Delete') {
        if (codeMirror.getValue().length < 1) {
          const cbPath = ReactEditor.findPath(slateEditor as any, element)
          ReactEditor.focus(slateEditor as any)
          const [, nextPath] = Editor.next(slateEditor as any, { at: cbPath })!
          Transforms.select(slateEditor, { path: nextPath, offset: 0 })
          slateEditor.deleteBackward('character')
          e.preventDefault()
        }
      }
      $.typingMode?.open(true)
    })

    codeMirror.on('cursorActivity', () => {
      const pos = codeMirror.getCursor()
      if (pos.outside === 1) {
        const next = slateEditor.itemPathNext(item.GetSlPath())
        if (next) {
          slateEditor.itemFocus(next)
        }
      } else if (pos.outside === -1) {
        const prev = slateEditor.itemPathPrev(item.GetSlPath())
        if (prev) {
          slateEditor.itemFocus(prev)
        }
      }
    })
  }, [langMode])

  React.useEffect(() => {
    if (!cm || !ref.current) return

    const editorView = ref.current.closest('article.editor-view')
    if (!editorView) return

    const debouncedRefresh = debounce(() => {
      cm.refresh()
    }, 100)

    const resizeObserver = new ResizeObserver(() => {
      debouncedRefresh()
    })

    resizeObserver.observe(editorView)

    return () => {
      resizeObserver.disconnect()
      debouncedRefresh.cancel()
    }
  }, [cm])

  const classList = [
    cls`
      margin-top: 8px;
      margin-bottom: 8px;
      display: inline-block;
      width: calc(100% - 2px);

      .CodeMirror.cm-s-mdn-like {
        background-image: none;
        background-color: #c6d0d50f;
        border: 1px solid #acbbc224;
      }

      .CodeMirror {
        height: auto;
        min-height: 30px;
        ${!lineNumbers ? 'padding: 4px' : ''};
        border-radius: 5px;
      }
    `,
    'plg-codemirror-wrap',
  ]

  const langMenuId = iky
  const handleLangMenuChange = (lang: LangInfo) => {
    // 临时屏蔽 setBaseAndExtent
    const originalSetBaseAndExtent = window.getSelection()!.setBaseAndExtent.bind(window.getSelection())
    window.getSelection()!.setBaseAndExtent = () => {}

    $.inlines.setProps(slateEditor, item.GetSlPath(), {
      langName: lang.langName,
      mode: lang.mode,
      iky,
    } as any)

    // 还原
    Promise.resolve().then(() => {
      window.getSelection()!.setBaseAndExtent = originalSetBaseAndExtent
    })

    // 同步更新 CodeMirror 的 mode
    if (cm) {
      const modeInfo = getMode(lang.mode, lang.langName)
      cm.setOption('mode', modeInfo.mime ?? modeInfo.name)
    }
  }

  const inner = (
    <div
      className={cls`
        position: relative;

        .codeblock-langs-menu {
          transition: opacity 0.2s;
          transition-delay: 0.3s;
          opacity: 0;
        }

        &:hover {
          .codeblock-langs-menu {
            opacity: 1;
          }
        }`}
    >
      <LangsMenu
        value={langName}
        id={langMenuId}
        onChange={handleLangMenuChange}
      />
      <div className={classList.join(' ')} ref={ref} />
    </div>
  )
  return <InlineOuterComp cssInlineBlock {...props} noFocusRing inner={inner} />
}
