import React from 'react'
import { ContextItemToolbarDOM } from './ItemToolbarComp'

/**
 * Hook to get the original item DOM reference when inside a float toolbar
 * Returns null when not in a float toolbar context
 * 
 * Usage example:
 * ```tsx
 * const originalDOM = useOriginalItemDOM()
 * if (originalDOM) {
 *   // Access the original item's DOM element
 *   const rect = originalDOM.getBoundingClientRect()
 *   // ... do something with the original DOM
 * }
 * ```
 */
export function useOriginalItemToolbarDOM() {
  return React.useContext(ContextItemToolbarDOM)
}
