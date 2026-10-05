import { useAddons } from './useAddons'
import React from 'react'
import {
  ContextLayoutDepth,
  ContextLayoutName,
} from '../addons/LayoutFactory/LayoutContexts'

export function useItemLayoutStyle() {
  const { layoutFactory } = useAddons()
  const contextLayout = React.useContext(ContextLayoutName)
  const contextLayoutDepth = React.useContext(ContextLayoutDepth)
  const styles = layoutFactory?.getStyle(contextLayout)
  return styles?.[contextLayoutDepth] ?? layoutFactory?.getStyle('default')[0]
}
