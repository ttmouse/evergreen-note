import React from 'react'
import { IAddon, App, NewAddonParams } from '../../engine/App'

export function createConditionBuilderAddon({ app, $ }: NewAddonParams) {
  class ConditionBuilder implements IAddon {
    app!: App
    config = {}

    addonRun() {
      // Initialization for this the addon ConditionBuilder
    }
  }

  return { conditionBuilder: new ConditionBuilder() }
}
