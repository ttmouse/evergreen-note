import React from 'react'
import { useAddons } from '../../hooks/useAddons'
import { useAwait } from '../../hooks/useAwait'
import { cls } from '../../styles'
import { loadCss } from '../../utils/dom/loadCss'
import { loadScript } from '../../utils/dom/loadScript'
import { CodeblockProps } from './CodeblockProps'
import { modesLoaded } from './CodeblockElementComp'

export function CodeblockComp(props: CodeblockProps) {
  const ref = React.useRef<HTMLDivElement>(null)
  const $ = useAddons()
  const {
    value = '',
    lineNumbers,
    mode,
    nkMode,
    autofocus,
    onChange = () => null,
  } = props
  const [val, setVal] = React.useState(value)

  useAwait(async () => {
    if (!ref.current) {
      return
    }

    await loadScript('js/codemirror/lib/codemirror.min.js')
    const opt = {
      mode,
      nkMode,
      lineWrapping: true,
      indentUnit: 2,
      tabSize: 2,
      theme: 'mdn-like',
      lineNumbers,
      value,
      autofocus,
    }

    if (!modesLoaded.includes(opt.nkMode ?? opt.mode)) {
      modesLoaded.push(opt.nkMode ?? opt.mode)
    }

    const srcList = [
      loadCss('js/codemirror/lib/codemirror.css'),
      ...modesLoaded.map(
        (theMode) => $.codeblock.loadMode(theMode)
      ),
      $.codeblock.loadTheme(opt.theme),
    ]
    if ((opt.nkMode ?? opt.mode) === 'htmlembedded') {
      srcList.push($.codeblock.loadMode('multiplex'))
    }
    await Promise.all(srcList)
    const { CodeMirror } = window as any
    const codeMirror = CodeMirror(ref.current, opt)
    $.codeblock.setTheme(codeMirror)

    codeMirror.on('change', (e: any) => {
      const content = codeMirror.getValue()
      setVal(content)
      onChange(e, content)
    })
  }, [])

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
    'codeblock',
  ]

  return <div className={classList.join(' ')} ref={ref} />
}
