import { icons } from '../../../components/SvgIcon'
import { App, IAddon, NewAddonParams } from '../../engine/App'
import { Item } from '../../interfaces/item'
import { KyString } from '../../interfaces/unit'
import { isEmpty } from '../../utils/isEmpty'
import { userMkid } from '../../utils/string/mkid'
import { StarIcon } from './StarIcon'
import { makeAutoObservable } from 'mobx'
import { pub } from '../../utils/pub'
import { time } from '../../utils/date/time'
import { StarEditorComp } from './StarBodyComp'
import { $t } from '../../../i18n'

export const APP_STAR_KY = 'AppStars'

export function createStarAddon({ app, $ }: NewAddonParams) {
  class Star implements IAddon {
    app!: App
    config = {}
    starKy!: KyString = APP_STAR_KY
    staredList: KyString[] = []

    constructor() {
      makeAutoObservable(this)
    }

    createTopic(): void {
      // const ky = this.starKy;
      // const starTopicData = $.dbMemory.getItem(ky);
      // if (isEmpty(starTopicData)) {
      //   const newItem = Item.newItem({
      //     ky,
      //     pky: KYS.ROOT,
      //     isTopic: true,
      //     topic: 'app/stars',
      //     ori: 'App/Stars',
      //   }) as UnitPersist;
      //   $.dbMemory.saveItem(newItem);
      // }
      $.topic?.createTopic('App/Stars', {
        ky: APP_STAR_KY,
        asky: [userMkid(app.user.id, 'stars')],
      })
    }

    /**
     * Check if an item is starred or not.
     * @param ky
     * @returns
     */
    isStar(ky: KyString): boolean {
      // const { referText } = this.app.addons.dbMemory.indexed;
      // if (isEmpty(referText[ky])) {
      //   return false;
      // }
      // for (const item of Object.values(referText[ky])) {
      //   if (item.path.includes(this.starKy)) {
      //     return true;
      //   }
      // }
      // return false;
      return this.staredList.includes(ky)
    }

    /**
     * Add a star to an item.
     * @param ky
     * @param editor
     */
    add(ky: KyString): void {
      if (this.isStar(ky)) {
        return
      }
      const referElement = $.refer.createElement({ ky })
      const newItem = Item.make(
        {
          ky: `${ky}-star`,
          leaves: [{ text: '' }, referElement as any, { text: '' }],
          pky: APP_STAR_KY,
          weight: time(),
        },
        {} as any
      )
      $.dbMemory.saveItem(newItem)
      $.star.readStaredList()
    }

    cancel(ky: KyString): void {
      if (!this.isStar(ky)) {
        return
      }

      for (const item of Object.values($.dbMemory.indexed.path[APP_STAR_KY])) {
        if (item.referText?.includes(ky)) {
          $.dbMemory.deleteItem(item.ky, { isRecur: true })
        }
      }
      this.readStaredList()
    }

    toggle(ky: KyString) {
      if (this.isStar(ky)) {
        this.cancel(ky)
      } else {
        this.add(ky)
      }
    }

    readStaredList(): KyString[] {
      const items = $.dbMemory.getItemsByIndex('path', APP_STAR_KY)
      const result: KyString[] = []
      for (const item of items) {
        if (Array.isArray(item.referText)) {
          result.push(...item.referText)
        }
      }
      this.staredList = result
      return result
    }

    addonInfo() {
      return {
        title: $t`star.title`,
        quote: $t`star.quote`,
        type: 'fieldset',
        defaultValue: 'on',
      }
    }

    addonRun() {
      const oldStarKy = userMkid(app.user.id, 'stars')

      // COMPAT:
      // 把以前旧的星标主题数据迁移到新的星标主题
      if (!isEmpty($.dbMemory.indexed.pky[oldStarKy])) {
        for (const item of Object.values($.dbMemory.indexed.pky[oldStarKy])) {
          $.dbMemory.saveItem({ ...item, pky: APP_STAR_KY })
        }
      }

      $.nav.addItems({
        stars: {
          size: 18,
          order: 4000,
          title: $t`star.nav_title`,
          icon: icons.svg_star,
          onClick(event) {
            const ele = event.target as HTMLElement
            if (ele.matches('.node-head')) {
              $.router.to({ ky: APP_STAR_KY })
            }
          },
          foot: StarEditorComp,
        },
      })

      $.editorView.addExtraItems({ StarIcon })

      this.createTopic()

      pub.on(pub.evt.dbIndexChanged, ({ indexName, indexValue }) => {
        if (
          indexName === 'referText' ||
          (indexName === 'path' && indexValue === APP_STAR_KY)
        ) {
          this.readStaredList()
        }
      })

      this.readStaredList()
    }
  }

  return { star: new Star() }
}
