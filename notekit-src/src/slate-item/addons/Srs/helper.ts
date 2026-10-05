import { makeAutoObservable } from 'mobx'
import { fromNow } from '../../utils/date/datekit'
import { time } from '../../utils/date/time'
import { isEmpty } from '../../utils/isEmpty'
import { NEW_CARD_WEIGHT, SRS_KY } from './Srs'
import { ItemWithSrsCard, ItemWithSrsDeck, QUALITY, FlashCard } from './types'

export function initCard() {
  return {
    ef: 2.5,
    repetitions: 0,
    interval: 1,
    totalrepetitions: 0,
    quality: QUALITY.UNKNOWN,
    totalquality: 0,
    counts: {
      0: 0,
      1: 0,
      2: 0,
      3: 0,
      4: 0,
      5: 0,
    },
    due: 0,
    stars: 0,
    logs: [],
    weight: NEW_CARD_WEIGHT,
  }
}

/**
 * 根据 SM2 算法，计算卡片下次复习的间隔天数、EF值
 * @param {Object} cardcard
 * @param {number} quality 评分（0～5）
 * @returns
 */
export function sm2(card: FlashCard, quality: QUALITY) {
  let ef = Math.max(
    1.3,
    card.ef + 0.1 - (5.0 - quality) * (0.08 + (5.0 - quality) * 0.02)
  )
  ef = Math.round(ef * 100) / 100

  let interval: number
  let repetitions: number

  if (quality > 3) {
    if (card.repetitions < 1) {
      interval = 1
      repetitions = 1
    } else if (card.repetitions === 1) {
      interval = 6
      repetitions = 2
    } else {
      interval = Math.round(card.interval * ef)
      repetitions = card.repetitions + 1
    }
  } else if (quality === 3) {
    if (card.repetitions < 1) {
      interval = 1
      repetitions = 1
    } else if (card.repetitions === 1) {
      interval = 4
      repetitions = 2
    } else {
      interval = Math.round(card.interval * ef)
      repetitions = card.repetitions + 1
    }
  } else {
    interval = 0.1
    repetitions = 0
  }

  return { interval, repetitions, ef }
}

/**
 * 计算卡片的排序权重
 */
export function srsCalcWeight(card: FlashCard | undefined, dueTime = time()): number {
  if (typeof card !== 'object') {
    return NEW_CARD_WEIGHT
  }

  const delays = dueTime - card.due
  if (delays < 0) {
    // 还没到期
    return -1
  }

  const validNum = (n: any) => typeof n === 'number' && n > 0

  // 以时间作为权重计算的参照
  let weight = delays

  // 用户标记的星星数量代表卡片的重要度
  // 每多1个星星，权重就增加一倍
  if (validNum(card.stars)) {
    weight *= card.stars
  }

  // 与今天复习过的卡片内容的关联程度

  // 新卡将优先显示
  if (validNum(card.repetitions) && card.repetitions < 5) {
    weight *= 5 - card.repetitions
  }

  // 错得多的将优先显示(累计得分/累计理想分)
  if (validNum(card.totalquality) && validNum(card.repetitions)) {
    weight *= (5 * card.repetitions) / card.totalquality
  }

  // 如果得分是单调递增的，排名进一步靠后
  if (!isEmpty(card.logs)) {
    const score = card.logs[card.logs.length - 1].quality
    let increaseCount = 1
    for (let i = card.logs.length - 2; i >= 0; i--) {
      if (card.logs[i].quality > score) {
        break
      }
      increaseCount++
    }
    weight /= increaseCount
  }

  return weight
}

export function hasCardInfo(item: UnitPersist): item is ItemWithSrsCard {
  return !isEmpty((item as any).srs?.card)
}

export function isDue(item: ItemWithSrsCard, dueTime = time()): boolean {
  return !!(item.srs?.card?.due && item.srs.card.due < dueTime)
}

export function calcDue(card: FlashCard, quality: QUALITY) {
  const { interval } = sm2(card, quality)
  return interval
}

export class CardCache {
  private items: { [ky: string]: ItemWithSrsCard } = {}

  constructor() {
    makeAutoObservable(this)
  }

  getItems() {
    return this.items
  }

  get(ky: string) {
    return this.items[ky]
  }

  getCount() {
    return Object.keys(this.items).length
  }

  add(item: ItemWithSrsCard) {
    this.items[item.ky] = item
  }

  delete(ky: string) {
    delete this.items[ky]
  }

  clear() {
    this.items = {}
  }
}
