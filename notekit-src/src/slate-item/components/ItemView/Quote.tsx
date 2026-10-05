import React from 'react'
import { ElementComponentProps } from '../../addons/EditorView/EditorView'
import { Node } from '../../slate.inc'
import { cls, colorBase } from '../../styles'
import { appendStyle } from '../../utils/dom/appendStyle'
import { isEmpty } from '../../utils/isEmpty'

appendStyle(`
  .node-quote.quote-empty {
    display: none;
  }

  .node-quote-active .node-quote {
    display: block;
    color: var(--cl-slate-400);
  }
`)

const quoteStyle = cls`
  min-width: 100%;
  min-height: 20px;
  // color: var(--cl-slate-300);
  color: #C1CDE1;
  font-size: 14px;
  transition: all 0.2s ease-in-out;

  &:hover {
    color: var(--cl-slate-400);
  }
`

export const Quote = (props: ElementComponentProps<any>) => {
  const { attributes, children, element } = props
  const classList = [quoteStyle, 'node-quote']
  if (element && isEmpty(Node.string(element))) {
    classList.push('quote-empty')
  }
  return (
    <div className={classList.join(' ')} {...(attributes as any)}>
      {children}
    </div>
  )
}
