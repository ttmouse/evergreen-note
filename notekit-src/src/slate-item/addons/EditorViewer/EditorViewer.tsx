import { NewAddonParams, App, IAddon } from '@/slate-item/engine/App'
import React from 'react'

export function createEditorViewerAddon({ app, $ }: NewAddonParams) {
  class EditorViewer implements IAddon {
    app!: App
    config = {}

    createComponent() {
      return () => {
        return <>ddd</>
      }
    }

    addonRun() {
      $.router?.register({
        viewer: {
          title: 'EditorViewer',
          comp: this.createComponent(),
          minWidth: 790,
        },
      })
    }
  }

  return { EditorViewer: new EditorViewer() }
}

// ...createEditorViewerAddon(params),
