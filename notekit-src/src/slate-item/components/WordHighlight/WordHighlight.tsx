import React from 'react'
import { cls, colorBase } from '../../styles'
import { keywordAround } from '../../utils/string/keywordAround'
import { isEmpty } from '@/slate-item/utils/isEmpty'

export type WordHighlightProps = {
  content: string
  keyword: string
  modifier?: string
  limitLength?: number
}

const cssClass = cls`font-weight: bolder; font-size: 1.1em; background: ${[colorBase.warning, 400]};`

export function WordHighlight(props: WordHighlightProps) {
  const { content, keyword, modifier = 'ig', limitLength = Infinity } = props
  if (isEmpty(content)) {
    return null
  }

  const parts = keywordAround(content, keyword, 100)

  if (parts.length === 1 && parts[0].length > 1000) {
    parts[0] = parts[0].slice(0, 1000) + '...'
  }

  return (
    <span>
      {' '}
      {parts.map((part, i) => (
        <span
          key={i}
          className={
            part.toLowerCase() === keyword.toLowerCase() ? `word-highlight ${cssClass}` : ''
          }
        >
          {part}
        </span>
      ))}{' '}
    </span>
  )
}
