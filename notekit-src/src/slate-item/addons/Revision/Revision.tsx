import React from 'react'
import { IAddon, App, NewAddonParams } from '../../engine/App'
import {
  Item,
  ItemEditor,
  ItemNode,
  ItemTransforms,
  KyString,
  UNIT_STATUS,
} from '@/slate-item'
import { isEmpty, notEmpty } from '@/slate-item/utils/isEmpty'

export type RevisionScope = 'text' | 'block-self' | 'block-tree'

// for the after versions
export type RevisionalInfo = {
  vof: KyString
  caption: string
  reson?: string
  scope: RevisionScope
}

// for original version, to indicate which version to use
export type OriginalInfo = {
  active?: KyString
}

declare global {
  interface UnitPersist {
    revision?: Partial<RevisionalInfo> & Partial<OriginalInfo>
  }
}

export type RevisionalItem = UnitPersist & { revision: RevisionalInfo }
export type OriginalItem = UnitPersist & { revision: OriginalInfo }

function isOriginal(item: UnitPersist): item is OriginalItem {
  return isEmpty(item?.revision) || notEmpty(item?.revision?.active)
}

function isRevisional(item: UnitPersist): item is RevisionalItem {
  return notEmpty(item?.revision?.vof)
}

const UNACTIVE_STATUS = UNIT_STATUS.HIDDEN

export function createRevisionAddon({ app, $ }: NewAddonParams) {
  class Revision implements IAddon {
    app!: App
    config = {}

    add(
      editor: ItemEditor,
      item: ItemNode,
      options: { caption: string; scope: RevisionScope }
    ) {
      const original = $.revision.getOriginal(item)
      const revisional = Item.newItem({
        pky: original.pky,
        revision: {
          vof: original.ky,
          ...options,
        },
      })

      $.dbMemory.saveItem(revisional)

      $.dbMemory.updateItem(original.ky, {
        status: UNACTIVE_STATUS,
        revision: {
          active: revisional.ky,
        },
      })
    }

    getOriginal(item: UnitPersist): UnitPersist {
      if (isRevisional(item)) {
        return $.dbMemory.getItem(item.revision?.vof)
      }
      return item
    }

    getActive(item: UnitPersist): UnitPersist {
      const original = $.revision.getOriginal(item)
      return original.revision?.active
        ? $.dbMemory.getItem(original.revision?.active)
        : original
    }

    activate(editor: ItemEditor, currentItem: ItemNode, nextRevisional: UnitPersist) {
      const original = $.revision.getOriginal(currentItem)
      $.dbMemory.saveItem({
        ...original,
        revision: {
          active: nextRevisional.ky,
        },
      })
    }

    addonInfo() {
      return {
        title: 'Revision',
        quote: `Via the addon Revision, we can create versions for a block, and decide which one to be adopted`,
      }
    }

    addonRun() {
      // Initialization for this the addon Revision
    }
  }

  return { revision: new Revision() }
}
