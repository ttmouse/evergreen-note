import { TimeSecond, KyString } from '../../interfaces/unit'
import { LogicString } from '../Traits/Logic'
import { CLOZE_OPTIONS } from './Srs'

export type ClozeType = keyof typeof CLOZE_OPTIONS

/**
 * 复习任务的配置信息
 */
export type SrsDeckInfo = {
  where: LogicString
  cloze: ClozeType[]
  regexp: string
}

/**
 * 存放着卡片信息的节点
 */
export interface ItemWithSrsCard extends UnitPersist {
  srs?: {
    // 作为卡片时的字段
    card: FlashCard
  }
}

export interface ItemWithSrsDeck extends UnitPersist {
  srs?: {
    // 作为复习计划时的字段
    deck: SrsDeckInfo
  }
}

/**
 * 复习效果的5个得分等级
 */
export enum QUALITY {
  UNKNOWN = 0, // 尚无反馈
  ONE = 1, // 完全忘了
  TWO = 2, // 部分记得
  THREE = 3, // 记得但费力
  FIVE = 5, // 轻松地记起
}

/**
 * 记录卡片每次练习的情况
 */
export type SrsLog = {
  // 本次练习的得分
  quality: QUALITY
  // 起始时间
  st: TimeSecond
  // 完成时间
  et: TimeSecond
  // 本次练习的间隔
  interval: number
}

export type FlashCard = {
  // 建议下次复习的时间
  due: TimeSecond
  // 卡片所设的星级
  stars: number
  // 累计复习次数, 当复习反馈是“困难”时会重置为 0
  repetitions: number
  // 累计复习得分
  totalquality: number
  // 历次练习的记录
  logs: SrsLog[]
  // 复习反馈得分
  quality: QUALITY
  // 累计复习次数，永不会重置
  totalrepetitions: number

  counts: { [q in QUALITY]: number }

  ef: number
  interval: number
  weight: number
}
