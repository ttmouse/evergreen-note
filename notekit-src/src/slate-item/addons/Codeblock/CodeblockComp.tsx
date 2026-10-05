import React from 'react'
import { useAddons } from '../../hooks/useAddons'
import { cls } from '../../styles'
import { loadCss } from '../../utils/dom/loadCss'
import { loadScript } from '../../utils/dom/loadScript'
import { CodeblockProps } from './CodeblockProps'
import { loadCodeMirrorMode } from './loadCodeMirrorMode'

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
  const [ready, setReady] = React.useState(false)

  React.useEffect(() => {
    let disposed = false
    const initialize = async () => {
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

      const srcList = [
        loadCss('js/codemirror/lib/codemirror.css'),
        $.codeblock.loadTheme(opt.theme),
      ]
      await Promise.all(srcList)
      const hasMode = await loadCodeMirrorMode($.codeblock, opt.nkMode ?? opt.mode)
      if (!hasMode) opt.mode = 'text/plain'
      if (disposed || !ref.current) return
      const { CodeMirror } = window as any
      const codeMirror = CodeMirror(ref.current, opt)
      $.codeblock.setTheme(codeMirror)
      setReady(true)

      codeMirror.on('change', (e: any) => {
        const content = codeMirror.getValue()
        setVal(content)
        onChange(e, content)
      })
    }
    initialize().catch(error => console.warn('Code editor unavailable; showing source text.', error))
    return () => {
      disposed = true
      if (ref.current) ref.current.innerHTML = ''
    }
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

  return <>
    <div className={classList.join(' ')} ref={ref} />
    {!ready && <pre className="codeblock-source" style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{val}</pre>}
  </>
}
