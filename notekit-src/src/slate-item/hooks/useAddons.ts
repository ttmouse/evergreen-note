import React from 'react'
import type { LoadedAddons } from '../../main'
import { ContextApp } from '../addons/UI/UIContexts'
import type { App } from '../engine/App'

// Addons are registered before mounting the UI. A restart replaces this map,
// so the new app session gets a fresh view without copying it for every node.
const addonViews = new WeakMap<LoadedAddons, LoadedAddons & { app: App }>()

export function useAddons(): LoadedAddons & { app: App } {
  const app = React.useContext(ContextApp)
  let view = addonViews.get(app.addons)
  if (!view) {
    view = { ...app.addons, app }
    addonViews.set(app.addons, view)
  }
  return view
}
