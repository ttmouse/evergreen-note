import { $t } from '../../../../i18n'
import { IAddon, App, NewAddonParams } from '../../../engine/App'
import { before } from '../../../engine/helper'
import { datekit, YYYY_MM_DD } from '../../../utils/date/datekit'
import { isEmpty, notEmpty } from '../../../utils/isEmpty'
import { AddonInfo } from '../../AddonCenter/AddonCenterComp'
import { withReference } from '../../Backlink/LinkedReferenceComp'
import { ItemMap } from '../../DbMemory/DbMemory'

declare global {
  interface MemoryIndexed {
    created: { [date: YYYY_MM_DD]: ItemMap }
    updated: { [date: YYYY_MM_DD]: ItemMap }
  }
}

export function createDailyActivityAddon({ app, $ }: NewAddonParams) {
  class DailyActivity implements IAddon {
    app!: App
    config = {}

    getUpdatedItems(date: YYYY_MM_DD): UnitPersist[] {
      return date in $.dbMemory.indexed.updated
        ? Object.values($.dbMemory.indexed.updated[date])
        : []
    }

    getCreatedItems(date: YYYY_MM_DD): UnitPersist[] {
      return typeof $.dbMemory.indexed.created === 'object' &&
        date in $.dbMemory.indexed.created
        ? Object.values($.dbMemory.indexed.created[date]).map((item) =>
            $.dbMemory.getItem(item.ky, { isRecur: true })
          )
        : []
    }

    addComponentToEditorView() {
      const CreatedReferenceComp = withReference({
        type: 'created',
        i18nTitle: 'dailyActivity.created_references',
        getList: (item) => $.dailyActivity.getCreatedItems(item.ky),
        foldup: true,
      })
      $.editorView.addMoreComponent(CreatedReferenceComp)

      const UpdatedReferenceComp = withReference({
        type: 'updated',
        i18nTitle: 'dailyActivity.updated_references',
        getList: (item) => $.dailyActivity.getUpdatedItems(item.ky),
        foldup: true,
      })
      $.editorView.addMoreComponent(UpdatedReferenceComp)
    }

    addonInfo() {
      return {
        title: $t`dailyActivity.title`,
        quote: $t`dailyActivity.quote`,
        defaultValue: 'off',
        updated: 20221109,
        depend: ['daily'],
        tags: ['time management'],
      }
    }

    addonBeforeRun() {
      before(
        $.daily.addComponentToEditorView,
        $.dailyActivity.addComponentToEditorView
      )

      Object.assign($.dbMemory.indexes, {
        updated: {
          unique: false,
          indexVal(item: UnitPersist) {
            if (!isEmpty(item.updated)) {
              return datekit(item.updated).format(YYYY_MM_DD)
            }
          },
        },
        created: {
          unique: false,
          indexVal(item: UnitPersist) {
            if (!isEmpty(item.created)) {
              return datekit(item.created).format(YYYY_MM_DD)
            }
          },
        },
      })
    }

    addonRun() {
      // Initialization for this DailyActivity
    }
  }

  return { dailyActivity: new DailyActivity() }
}
