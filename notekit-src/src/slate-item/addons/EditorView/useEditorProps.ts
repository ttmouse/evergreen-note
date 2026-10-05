import React from 'react'
import { ContextEditorInfo } from './EditorViewContexts'

export function useEditorProps() {
  const { props } = React.useContext(ContextEditorInfo)
  return props
}
