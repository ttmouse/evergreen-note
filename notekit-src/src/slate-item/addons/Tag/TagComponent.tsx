import React from 'react'
import { useAddons } from '../../hooks/useAddons'
import { useSelected, useFocused } from '../../slate.inc'
import { ElementComponentProps } from '../EditorView/EditorView'
import { trimSharp } from './helper'
import { TagElement } from './Tag'

const tagStyle = {
  cursor: 'pointer',
} as React.CSSProperties

const selectedTagStyle = {
  ...tagStyle,
  boxShadow: '0 0 0 2px #B4D5FF',
  borderRadius: 4,
} as React.CSSProperties

export function TagComp(props: ElementComponentProps<TagElement>) {
  const $ = useAddons()
  const { element, attributes, children } = props
  const selected = useSelected()
  const focused = useFocused()
  const tagText = element.value || ''

  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault()
    $.tag.open(tagText)
  }

  return (
    <span
      {...attributes}
      style={selected && focused ? selectedTagStyle : tagStyle}
      className="mark-tag element-tag"
      onClick={handleClick}
    >
      {children}
      <span contentEditable={false}>#{trimSharp(tagText)}</span>
    </span>
  )
}