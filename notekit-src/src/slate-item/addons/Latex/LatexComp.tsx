import React from 'react'
import { useAwait } from '../../hooks/useAwait'
import { cls, colorBase } from '../../styles'
import { loadCss } from '../../utils/dom/loadCss'
import { loadScript } from '../../utils/dom/loadScript'
import { ElementComponentProps } from '../EditorView/EditorView'
import { InlineOuterComp } from '../Inlines/InlineOuterComp'
import { LatexElement } from './Latex'
import { useAddons } from '../../hooks/useAddons'
import { useEditor } from '../../hooks/useEditor'
import { errorMsgStyle } from '../../components/ErrorMsg/ErrorMsg'

type LatexProps = {
  value: string
  displayMode?: boolean
  throwOnError?: boolean
}

export async function katexParse(props: LatexProps) {
  const { value } = props
  loadCss('js/katex/katex.min.css')
  await loadScript('js/katex/katex.min.js')
  const { katex } = window as any
  let parsed: any = ''
  try {
    parsed = katex.renderToString(value, props)
  } catch (e: any) {
    const msg = e.message.replace(/KaTeX parse\s+/i, 'Latex ')
    parsed = `<span class='${errorMsgStyle}'>${msg}</span>`
  }
  return parsed
}

export const LatexComp = (props: LatexProps) => {
  const ref = React.useRef<HTMLElement>(null)
  const { value } = props
  useAwait(async () => {
    const parsedText = await katexParse(props)
    ref.current!.innerHTML = parsedText
  }, [value])
  return <span ref={ref} />
}

export const LatexElementComp = (
  props: ElementComponentProps<LatexElement>
) => {
  const { element } = props
  const { content, value }: LatexElement = element as any

  const $ = useAddons()
  const editor = useEditor()

  const handleActive = (el: HTMLElement) => {
    setTimeout(() => {
      $.latex.inlinesBarForm({
        editor,
        element: element as any,
        SnapProps: {
          targetBox: el,
          place: ['center', 'bottom-out'],
        },
      })
    }, 100)
  }

  const onClick = (e: React.MouseEvent) => {
    handleActive(e.target as HTMLElement)
  }

  // const onSelect = (params: any) => {
  //   const { ref } = params;
  //   handleActive(ref.current);
  // };

  return (
    <InlineOuterComp
      // onSelect={onSelect}
      inner={<LatexComp value={content ?? value} />}
      onClick={onClick}
      {...props}
    />
  )
}
