import React from 'react'
import { ContextItem } from '../components/ItemView/ItemView'

export function useItem() {
  const ctxItem = React.useContext(ContextItem)
  return ctxItem
}
