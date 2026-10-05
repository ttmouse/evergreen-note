/* eslint-disable no-script-url */
import React from 'react'
import { cls, preset } from '../../styles'
import { ElementComponentProps } from '../EditorView/EditorView'
import { HyperlinkElement } from './Hyperlink'
import { InlineOuterComp } from '../Inlines/InlineOuterComp'
import { nodeString } from '../../utils/string/nodeString'
import { useAddons } from '../../hooks/useAddons'
import { Button } from '@mui/material'
import { isEmpty } from '@/slate-item/utils/isEmpty'

const linkStyle = [
  cls`
    ${preset.link.basic};
  `,
  'inline-element',
  'hyperlink',
  'element-hyperlink',
]

/*
注意：由于要支持打开 file:// 之类的本地协议的链接，
所以不能用 onClick = () => window.open() 的方式打开链接，
只能用 <a> 标签自身的能力打开链接。
*/

export function HyperlinkComp(props: ElementComponentProps<HyperlinkElement>) {
  const { element, attributes } = props
  const { url } = element as HyperlinkElement
  let attrs = attributes as any

  if (!url.includes(':') || url.startsWith('re:')) {
    // 在 router 插件中统一处理了
  } else {
    attrs = {
      ...attrs,
      url,
      target: '_blank',
      rel: 'noreferrer',
    }
  }
  const $ = useAddons()
  const inner = url.startsWith('re:') ? (
    <Button onClick={() => $.router.to(url)} className={linkStyle.join(' ')}>
      {element.title ?? nodeString(element)}
    </Button>
  ) : (
    <a href={url} className={linkStyle.join(' ')} {...attrs}>
      {!isEmpty(element.title) ? element.title : nodeString(element)}
    </a>
  )
  return <InlineOuterComp inner={inner} {...props} />
}
