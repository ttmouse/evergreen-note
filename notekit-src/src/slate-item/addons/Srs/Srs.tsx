import { IAddon, App, NewAddonParams } from '../../engine/App'
import { Item, ItemNode } from '../../interfaces/item'
import { KyString, TimeMilliSecond } from '../../interfaces/unit'
import { Logic, LogicString } from '../Traits/Logic'
import { srsCalcWeight, initCard, sm2, hasCardInfo, isDue } from './helper'
import { ItemWithSrsCard, ItemWithSrsDeck, QUALITY, SrsDeckInfo } from './types'
import React from 'react'
import { isEmpty } from '../../utils/isEmpty'
import { REVIEW_MODE, SrsDialogComp, SrsDialogProps } from './SrsDialogComp'
import { time } from '../../utils/date/time'
import { after, cover } from '../../engine/helper'
import { deepClone } from '../../utils/object/deepClone'
import { powerObj } from '../../utils/object/powerObj'
import { ItemTransforms } from '../../transforms/item'
import { $t } from '../../../i18n'
import { SrsDeckStartIcon, countKey } from './SrsDeckStartIcon'
import { SrsDeckSettingIcon } from './SrsDeckSettingIcon'
import { showSnack } from '../../utils/msg/showSnack'
import { DialogTitle } from './DialogTitle'
import { NavTitle } from './NavTitle'
import { atLater } from '../../utils/atLater'
import { setPubState } from '../../hooks/usePubState'
import { alertStyle } from '../Form/components/AlertElComp'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import { ReferLink } from '../Refer/ReferLink'
import { CardItemIcon } from './CardIcon'
import { withReference } from '../Backlink/LinkedReferenceComp'
import { cls } from '../../styles'

/**
 * 卡片隐藏的内容类型
 */
export const CLOZE_OPTIONS = {
  subitems: $t`srs.cloze_subitems`,
  quote: $t`srs.cloze_quote`,
  bold: $t`srs.cloze_bold`,
  underline: $t`srs.cloze_underline`,
  italic: $t`srs.cloze_italic`,
  code: $t`srs.cloze_code`,
  codeblock: $t`srs.cloze_codeblock`,
  latex: $t`srs.cloze_latex`,
  refer: $t`srs.cloze_refer`,
  bilink: $t`srs.cloze_bilink`,
  tag: $t`srs.cloze_tag`,
  note: $t`srs.cloze_note`, // 自定义标记的附注文字
  // colon2: 'Double colons',
  // regexp: 'Regular expression',
}

export type CLOZE_TYPE = keyof typeof CLOZE_OPTIONS

export const NEW_CARD_WEIGHT = 10000000000
export const PUB_KEY_SRS = 'srs-review-info'
export const SRS_KY = 'AppReview'

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function createSrsAddon({ app, $ }: NewAddonParams) {
  let reviewDialogId = ''

  class Srs implements IAddon {
    app!: App
    config = {}
    SRS_KY = SRS_KY

    indexedItems: { [ky: string]: ItemWithSrsCard } = {}

    calcWeight = srsCalcWeight
    initCard = initCard

    getIndexedItems(): UnitPersist[] {
      if (isEmpty($.srs.indexedItems)) {
        return this.getItemsOfAllDecks()
      }
      return Object.values($.srs.indexedItems)
    }

    /**
     * Check if an item is due for review
     * @param item
     * @param dueTime
     * @returns
     */
    shouldReview(item: UnitPersist, dueTime = time()) {
      if (
        (hasCardInfo(item) && !isDue(item, dueTime)) ||
        $.srs.isDeck(item) ||
        Item.isTextEmpty(item)
      ) {
        return false
      }
      // 对于已经到期、新卡片计算权重，以安排卡片的复习次序
      const weight = $.srs.calcWeight((item as ItemWithSrsCard)?.srs?.card, dueTime)
      return weight > 0
    }

    /**
     * Join all srs deck conditions together with ' OR ' operator
     * @returns
     */
    joinAllConditions() {
      return this.joinConditions($.dbMemory.getItemsByIndex('path', SRS_KY))
    }

    joinConditions(deckItems: ItemWithSrsDeck[]) {
      const keywords: string[] = []
      for (const item of deckItems) {
        const w = $.srs.getWhere(item as ItemWithSrsDeck)
        if (!isEmpty(w)) {
          keywords.push(`(${w!})`)
        }
      }
      return keywords.join(' OR ')
    }

    getAllDecks() {
      return $.dbMemory.getItemsByIndex('path', SRS_KY)
    }

    /**
     * Check if the item is in a srs deck
     * @param item
     * @returns
     */
    whichDeck(item: UnitPersist) {
      if (typeof item === 'string') {
        item = $.dbMemory.getItem(item)
      }

      for (const deckItem of $.srs.getAllDecks()) {
        const kw = $.srs.getWhere(deckItem as ItemWithSrsDeck)
        if (!isEmpty(kw) && $.traits.match(kw!, item)) {
          return deckItem
        }
      }
      return null
    }

    getItemsOfAllDecks(dueTime = time()) {
      if (isEmpty($.srs.indexedItems)) {
        const items = $.srs.getItems($.srs.joinAllConditions(), dueTime)
        for (const item of items) {
          // cache the items
          $.srs.indexedItems[item.ky] = item
        }
      }
      return Object.values($.srs.indexedItems)
    }

    /**
     * 读取到期的卡片节点
     * @param kw
     * @param dueTime
     * @returns
     */
    getItems(kw: LogicString, dueTime = time()) {
      const list: ItemWithSrsCard[] = $.search.query(kw) as any
      const arr: { [ky: KyString]: boolean } = {}
      // console.log(list)
      const dueList = list.filter((item) => {
        if (item.ky in arr) {
          return false
        }
        arr[item.ky] = true
        return $.srs.shouldReview(item, dueTime)
      })

      return dueList
    }

    /**
     * Get all items in a review deck
     * @param ky
     * @returns
     */
    getItemsOfDeck(kyOfDeck: KyString): ItemWithSrsCard[] {
      const deckItem = $.dbMemory.getItem(kyOfDeck)

      // A stale deck reference can outlive the referenced node. Treat it as an
      // empty deck instead of passing undefined into isDeck/getWhere.
      if (!deckItem) {
        return []
      }

      if ($.srs.isDeck(deckItem)) {
        let allResult: ItemWithSrsCard[] | null = null

        // 如果一个计划节点通过引用块指向了其他节点，
        // 则将被指向的节点的子节点作为复习卡片
        if (!isEmpty(deckItem.referText)) {
          const cardItems: any = []
          for (const rky of deckItem.referText!) {
            cardItems.push(...$.dbMemory.getSubitems(rky))
          }
          allResult = cardItems as any
        }

        // 如果一个计划节点通过双向链接指向了其他主题，
        // 则将该主题之下的子节点作为复习卡片
        if (!isEmpty(deckItem.mentions)) {
          const cardItems: any = []
          for (const topic of deckItem.mentions!) {
            const topicItem = $.dbMemory.getTopic(topic)
            if (!isEmpty(topicItem)) {
              cardItems.push(...$.dbMemory.getSubitems(topicItem!.ky))
            }
          }
          allResult = [...(allResult ?? []), ...cardItems]
        }

        // 只要一个计划节点存在引用块、双向链接，
        // 就不再通过关键词去搜索复习卡片
        if (!Array.isArray(allResult)) {
          const kw = $.srs.getWhere(deckItem)
          allResult = isEmpty(kw)
            ? []
            : ($.search.query(kw as string) as ItemWithSrsCard[])
        }

        // 读取牌组的子牌组的所有卡片
        const subDeckItems = $.dbMemory.getSubitems(deckItem.ky)
        if (!isEmpty(subDeckItems)) {
          let resultOfSubDeck: ItemWithSrsCard[] = []
          for (const subDeckItem of subDeckItems) {
            resultOfSubDeck = [
              ...resultOfSubDeck,
              ...$.srs.getItemsOfDeck(subDeckItem.ky),
            ]
          }
          allResult = [...(allResult ?? []), ...resultOfSubDeck]
        }

        //console.log(allResult)

        return allResult.filter((item) => $.srs.shouldReview(item, time() + 3600 * 4))
      }
      return []
    }

    /**
     * 当用户在复习全部卡片的时候，需要分辨它真正所属的具体复习计划
     * @param cardItem
     * @returns
     */
    getRealDeckItem(cardItem: ItemWithSrsCard) {
      for (const pitem of $.dbMemory.getItemsByIndex('path', $.srs.SRS_KY)) {
        const kw = $.srs.getWhere(pitem as ItemWithSrsDeck)
        if (!isEmpty(kw) && $.traits.match(kw!, cardItem)) {
          return pitem as ItemWithSrsDeck
        }
      }
      return null
    }

    /**
     * Display a form to edit the review deck
     * @param props
     */
    showDeckForm(props: { deckItem: ItemWithSrsDeck & ItemNode }) {
      const { deckItem } = props
      const { deck } = deckItem.srs ?? {}

      const ReferWhere = () => {
        return (
          <Box>
            <Alert severity="info" className={alertStyle}>
              <span>{$t`srs.located`}</span>
              <span className={cls`* { text-align: left !important; }`}>
                {Array.isArray(deckItem.referText) &&
                  deckItem.referText!.map((ky) => <ReferLink ky={ky} />)}
              </span>
            </Alert>
          </Box>
        )
      }

      $.form.popup<SrsDeckInfo>({
        title: $t`srs.deck_form_title`,
        name: 'srs-deck-form',
        initialValues: deck ?? ({} as any),
        width: 400,
        subitems: {
          where: !isEmpty(deckItem.referText)
            ? ReferWhere
            : {
                type: 'text',
                title: $t`srs.keywords_title`,
                quote: $t`srs.keywords_quote`,
              },
          cloze: {
            type: 'list',
            title: $t`srs.rule_title`,
            options: CLOZE_OPTIONS,
            quote: $t`srs.rule_quote`,
          },
          regexp: {
            type: 'text',
            title: $t`srs.regexp_title`,
            when: (v: any) => v.cloze?.includes('regexp'),
          },
        } as any,
        buttons: {
          [$t`common.save`]: (values) => {
            const newDeckItem = powerObj.set(deckItem, 'srs.deck', values) as any
            if ('GetEditor' in deckItem) {
              ItemTransforms.setItems((deckItem as ItemNode).GetEditor(), {
                at: deckItem.GetSlPath(),
                props: {
                  srs: newDeckItem.srs,
                },
              })
            } else {
              $.dbMemory.saveItem(newDeckItem)
            }
          },
          [$t`common.cancel`]: null,
        },
        DialogProps: {
          maxWidth: 'xs',
        },
      })
    }

    saveAnswer(
      item: ItemWithSrsCard,
      answerInfo: { st: TimeMilliSecond; quality: QUALITY }
    ) {
      const { st, quality } = answerInfo
      const card = item.srs?.card || $.srs.initCard()
      card.quality = quality
      const sm2result = sm2(card, quality)
      Object.assign(card, sm2result)
      card.counts[quality]++
      card.due = time() + sm2result.interval * 86400
      card.logs.push({
        st,
        et: Date.now(),
        interval: sm2result.interval,
        quality,
      })
      const newItem = {
        ...item,
        srs: {
          ...(item.srs ?? {}),
          card,
        },
      }

      $.srs.saveItem(newItem)
    }

    saveItem(item: ItemWithSrsCard) {
      return $.dbMemory.saveItem(item, { by: $.srs, shouldVerify: false })
    }

    showReviewDialog(props: { SrsProps: SrsDialogProps } & { title: string }) {
      if (!isEmpty(reviewDialogId)) {
        $.srs.closeReviewDialog()
      }
      const { SrsProps, title } = props
      const { queue, deckItem } = SrsProps

      reviewDialogId = $.dialog.show({
        title: <DialogTitle title={title} deckItem={deckItem} />,
        body: <SrsDialogComp {...SrsProps} />,
        classList: ['srs-dialog'],
        maxWidth: 'lg',
        backdrop: true,
        clickAway: isEmpty(queue),
      })
    }

    showReviewDialogOf(deckItem?: ItemWithSrsDeck) {
      if (!deckItem) {
        deckItem = $.dbMemory.getItem(SRS_KY)
      }
      if (!deckItem) {
        return
      }
      const { deck } = deckItem.srs ?? {}
      let condition = $.srs.getWhere(deckItem)
      if (isEmpty(condition) && deckItem.ky !== SRS_KY) {
        $.dialog.show({
          title: $t`common.notice`,
          maxWidth: 'xs',
          body: $t`srs.setup_notice`,
          buttons: {
            [$t`srs.setup`]: () => {
              $.srs.showDeckForm({
                deckItem: deckItem as any,
              })
            },

            [$t`common.cancel`]: null,
          },
        })

        return
      }

      let title = Item.headString(deckItem, { parseRefer: true })

      // 如果 deckItem 是 App/Review，
      // 则复习其下所有复习计划的卡片
      if (deckItem.ky === SRS_KY) {
        title = $t`common.all`
        condition = $.srs.joinAllConditions()
      }

      if (isEmpty(condition)) {
        showSnack({
          content: `No keywords to find out items for review`,
          severity: 'warning',
        })
        return
      }

      //console.log(condition)

      const queue = $.srs.getItems(condition!)

      const dialogProps = {
        SrsProps: {
          queue,
          mode: REVIEW_MODE.QUESTION,
          deck: deck as SrsDeckInfo,
          deckItem,
        },
        deckItem,
        title,
      }
      $.srs.showReviewDialog(dialogProps)
    }

    closeReviewDialog() {
      $.dialog.close(reviewDialogId)
      reviewDialogId = ''
    }

    createSrsTopic() {
      $.topic?.createTopic('App/Review', {
        ky: SRS_KY,
        // subitems: [
        //   {
        //     ky: 'AppReview-deck1',
        //     leaves: $.compat.convertText({} as any, 'The notes with `#card`'),
        //     quote:
        //       'Review items tagged with `#card`, whose subitems will act as answer.',
        //     srs: {
        //       deck: {
        //         where: '#card',
        //         cloze: ['subitems'],
        //       },
        //     },
        //   },
        //   {
        //     ky: 'AppReview-deck2',
        //     leaves: $.compat.convertText({} as any, 'Demo'),
        //     quote:
        //       'You can create more review decks by adding items under `App/Review` topic, then setup the rules for each deck, to tell the app how to find out the notes you want to review, and which part of the note will be used as question and answer.',
        //   },
        // ] as any,
      })
    }

    /**
     * 将一个节点作为复习计划，它的所有下级节点都是一个 flashcard
     * @param fromKy
     */
    createDeckFrom(fromKy: KyString) {
      $.refer.makeReferUnder(fromKy, SRS_KY)
      return $.refer.findUnder(fromKy, SRS_KY)
    }

    /**
     * 检查一个节点是否被通过双向链接、引用块的方式创建了复习任务
     * @param fromItem
     * @returns
     */
    hasDeckFrom(fromItem: UnitPersist): UnitPersist | false {
      return (
        $.refer.findUnder(fromItem.ky, SRS_KY) ||
        (!isEmpty(fromItem.topic) &&
          $.bilink.findUnder(fromItem.topic!, SRS_KY))
      )
    }

    getWhere(item: ItemWithSrsDeck & UnitPersist) {
      const condition: string[] = []
      if (Array.isArray(item.referText) && item.referText.length > 0) {
        condition.push(
          ...item.referText.map((ky: string) => `parent(ky(${ky}))`)
        )
      }
      if (Array.isArray(item.mentions) && item.mentions.length > 0) {
        condition.push(
          ...item.mentions.map((topic: string) => `parent(topic:'${topic}')`)
        )
      }
      if (!isEmpty(condition)) {
        return condition.join(' OR ')
      }
      // 读取子节点的 where 条件
      if ($.crumbs.getCrumbs(item).some((crumb) => crumb.ky === SRS_KY)) {
        const subitems = $.dbMemory.getSubitems(item.ky)
        const conds = subitems.map($.srs.getWhere)
        condition.push(...conds)
      }
      return [item.srs?.deck?.where ?? '', ...condition].join(' OR ')
    }

    isDeck(item: UnitPersist): item is ItemWithSrsDeck {
      if (!item) {
        return false
      }

      return (
        (typeof (item as any).srs?.deck === 'object' &&
          (item as any).srs?.deck !== null) ||
        (item.path?.includes(SRS_KY) &&
          (!isEmpty(item.referText) || !isEmpty(item.mentions))) ||
        $.dbMemory.getItemsByIndex('path', item.ky).some($.srs.isDeck)
      )
    }

    addonInfo() {
      return {
        title: $t`srs.title`,
        quote: $t`srs.quote`,
        updated: 2023_05_30,
        defaultValue: 'on',
      }
    }

    isCard!: (item: UnitPersist) => boolean

    addonBeforeRun() {
      let logic: Logic | null = null
      // 由于判断一个节点是否是 flashcard 的条件，可能会被更新，
      // 所以每隔一段时间，就得重新生成一次逻辑
      setInterval(() => (logic = null), 3000)

      const isCard = (item: UnitPersist) => {
        if (hasCardInfo(item)) {
          return true
        }
        if (!logic) {
          logic = $.traits.createLogic($.srs.joinAllConditions())
        }
        return (
          isEmpty(item.topic) &&
          !isEmpty(Item.headString(item)) &&
          logic.test(item)
        )
      }

      $.srs.isCard = isCard
      $.is.addRules({ card: isCard })
    }

    addonRun() {
      $.nav?.addItems({
        srs: {
          size: 16,
          order: 2000,
          title: <NavTitle />,
          icon: 'svg_srs',
          onClick() {
            $.srs.createSrsTopic()
            $.router?.to({ ky: SRS_KY })
          },
        },
      })

      $.srs.createSrsTopic()

      $.editorView.addExtraItems({
        SrsDeckStartIcon,
        SrsDeckSettingIcon,
        CardItemIcon,
      })

      $.editorView.addDropdown({
        srs: {
          title: $t`srs.create_deck_from`,
          icon: 'svg_srs',
          onClick(e, { item }) {
            const foundDeckItem = $.srs.hasDeckFrom(item)

            if (foundDeckItem) {
              $.dialog.confirm(
                `You've already made a review deck with this item`,
                {
                  severity: 'warning',
                  onConfirm() {
                    $.router.to(
                      { ky: SRS_KY },
                      { highlightItems: foundDeckItem.ky }
                    )
                  },
                  confirmLabel: 'Check it',
                }
              )
              return
            }
            $.dialog.confirm(
              // eslint-disable-next-line prettier/prettier
              <>
                <p>
                  You will make a review deck <ReferLink ky={item.ky} /> under
                  <ReferLink ky={SRS_KY} />, and all its subitems will be
                  flashcards
                  {/* {$t('srs.confirm_create_deck_from', {
                    referTopic: <ReferLink ky={item.ky} />,
                    srsTopic: <ReferLink ky={SRS_KY} />,
                  })} */}
                </p>
              </>,
              {
                dialogId: 'confirm-make-srs-deck',
                severity: 'info',
                onConfirm() {
                  const deckItem = $.srs.createDeckFrom(item.ky) as any
                  if (!deckItem) {
                    showSnack(`Failed to make review deck`)
                  } else {
                    $.dialog.confirm(
                      'Successfully made review deck, do you want to setup it now?',
                      {
                        severity: 'success',
                        onConfirm: () => {
                          $.srs.showDeckForm({
                            deckItem,
                          })
                        },
                      }
                    )
                  }
                },
                canRembember: true,
              }
            )
          },
        },
      })

      // const { revertItem } = $.docver ?? {}
      // cover(revertItem, (oldItem) => {
      //   // 如果是 docver 给笔记恢复旧版本时
      //   // 要将当前笔记 flashcard 信息也随恢复时同步到旧版本
      //   const currentItem = deepClone($.dbMemory.getItem(oldItem.ky))
      //   if (hasCardInfo(currentItem)) {
      //     ;(oldItem as any).srs = currentItem.srs
      //   }
      //   return revertItem.call($.docver, oldItem)
      // })

      after($.dbMemory.saveItem, (_, item) => {
        atLater(
          async () => {
            if ($.srs.isDeck(item)) {
              $.srs.indexedItems = {}
            } else {
              const deckItem = $.srs.whichDeck(item)
              if (item.ky in $.srs.indexedItems) {
                if (
                  !Item.isNormalStatus(item) ||
                  !deckItem ||
                  !$.srs.shouldReview(item)
                ) {
                  delete $.srs.indexedItems[item.ky]
                  setPubState(
                    countKey(SRS_KY),
                    Object.keys($.srs.indexedItems).length
                  )
                }
              } else if (
                deckItem &&
                $.srs.shouldReview(item) &&
                item.ky in $.srs.indexedItems === false
              ) {
                $.srs.indexedItems[item.ky] = item
                // if (item.$id) {
                //   const el = document.getElementById(item.$id)
                //   const to = document.getElementById(`${app.appName}-srs`)
                //   if (el && to) {
                //     move(el, to)
                //   }
                // }
              }
            }

            setPubState(
              countKey(SRS_KY),
              Object.keys($.srs.getIndexedItems()).length
            )
          },
          `srs-index-${item.ky}`,
          1000
        )
      })

      const DeckReferenceComp = withReference({
        type: 'review',
        i18nTitle: 'srs.linked_references',
        getList: (item) =>
          item.ky === SRS_KY ? [] : $.srs.getItemsOfDeck(item.ky),
        foldupTopics: false,
      })
      $.editorView.addMoreComponent(DeckReferenceComp)
    }
  }
  return { srs: new Srs() }
}
