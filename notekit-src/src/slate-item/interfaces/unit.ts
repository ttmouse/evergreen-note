import React from 'react'
import { PrimitiveIcon } from '../../components/MaterialIcon'
import { SnippetProps } from '../addons/Snippet/Snippet'
import { LogicString } from '../addons/Traits/Logic'
import { UnitType } from '../components'
import { ControlMethod } from '../hooks/useReducerUnit'
import { Node } from '../slate.inc'
import { ValueOf } from '../utils/string/mkid'

export type TimeMilliSecond = number
export type TimeSecond = number

export enum UnitMode {
  EditFirst = 'edit-first',
  ClickFirst = 'click-first',
  ReadFirst = 'read-first',
  ReadOnly = 'read-only',
  Drag = 'drag',
}

export type UnitCallbackParams = {
  close?: (isClose: boolean) => void
  dispatch?: React.Dispatch<any>
  control?: ControlMethod
  props?: Partial<UnitProps>
  event?:
    | KeyboardEvent
    | MouseEvent
    | TouchEvent
    | WheelEvent
    | PointerEvent
    | Event
}

type CssClasses = string
export type PartProps = {
  className?: CssClasses
  onMouseEnter?: (params: UnitCallbackParams) => void
  onClick?: (params: UnitCallbackParams) => void
  [k: string]: any
}

export type AllPartProps = {
  node: CssClasses | PartProps
  icon: CssClasses | PartProps
  head: CssClasses | PartProps
  extra: CssClasses | PartProps
  foot: CssClasses | PartProps
  body: CssClasses | PartProps
  child: CssClasses | PartProps
  crumbs: CssClasses | PartProps
}

export type UnitPart = keyof AllPartProps
export type UnitCrumbItem = {
  ky: KyString
  text: string
  isTopic?: boolean
}
export type UnitCrumbs = UnitCrumbItem[]
export type UnitVersions = { [k: string]: { v: string } }
export type KyString = string

export const UNIT_STATUS = {
  ELIMINATED: -2,
  TRASH: -1,
  NORMAL: 1,
  HIDDEN: 2,
  TEMP: 99,
} as const
export type UnitStatus = ValueOf<typeof UNIT_STATUS>

export enum UNIT_ROLE {
  ITEM = 'item',
  TOPIC = 'topic',
  LIBRARY = 'library',
  USER = 'user',
  PREFER_ITEM = 'prefer-item',
  PREFER_PLAN = 'prefer-plan',
}

export interface UnitBase {
  /**
   * Item ID
   */
  ky: KyString

  /**
   * 父级 ID
   */
  pky: KyString

  /**
   * 节点的纯文本内容
   */
  ori: string

  /**
   * 某一些功能会用到的“值”字段
   */
  value?: unknown

  status?: UnitStatus

  /**
   * 当前笔记的 Icon
   * 可以是一个图片的 URL, 也可以是一个图标的名称, 又或者是自定义的 HTML 文字
   */
  icon?: PrimitiveIcon

  /**
   * 节点的备注文字内容
   */
  quote?: string

  /**
   * 下级节点
   */
  subitems?: Partial<UnitPersist>[] | { [ky: string]: Partial<UnitPersist> }

  /**
   * 粒度
   */
  role?: UNIT_ROLE

  /**
   * 当前笔记的状态
   * -2: 永久删除
   * -1: 回收站
   * 99: 在回收站显示时的临时状态
   */

  /**
   * 排序权重值
   */
  weight?: number

  /**
   * 节点的创建时间
   */
  created: TimeSecond

  /**
   * 节点的最后修改时间
   */
  updated: TimeSecond

  group?: number
}

declare global {
  export interface UnitPersist extends UnitBase {
    $id: string

    /**
     * 数据库ID
     */
    $dbid?: KyString

    $isTmp?: boolean
    $isRefer?: boolean
    
    /**
     * ID 别名
     *
     * 你可以通过 asky 给同一条笔记手动赋予多个 ID, 只要保证这些ID在整个数据库范围内是唯一的.
     * 其中一个使用场景就是: 你需要导入其他笔记工具的数据, 但你又希望保留原来的ID, 可以使用这个字段.
     *
     * 又或者某种场景之下, 你希望给一条笔记赋予一个更具语义化的、易于记忆的ID, 以便你去引用那个笔记,
     * 比如你可以给“欧拉公式”这个主题笔记赋一个“euler-formula”的ID,
     * 然后你就可以凭记忆直忆引用它了: ((euler-formula))
     */
    asky?: string[]

    uploaded?: TimeSecond // 上传到服务器的时间，不一定有

    /**
     * 节点的上级路径
     */
    path: KyString[]

    /**
     * 节点内的行内元素ID
     */
    ikys?: KyString[]

    /**
     * 面包屑
     */
    crumbs?: UnitCrumbs

    /**
     * Slate 叶子节点的结构化数据
     */
    leaves: Node[]

    /**
     * 主题节点的 key 值
     * 很多情况下，topic 的值是和 ori 的值是一样的，
     * 但并不总是如此，topic 的值是被 purify 过的，
     * 它会过滤掉一些干扰的字符，比如空格、换行、标点符号等
     */
    topic?: string

    /**
     * 标记节点是否是主题节点
     */
    isTopic?: boolean

    blockType?: string

    /**
     * 占位符
     */
    placeholder?: string

    /**
     * 多版本支持
     *
     * 在本应用中, 我们支持了给某个主题关键词设定同义词,
     * 现在, 我们往更深层次来看待“同义词”这个概念, 它其实是同一事物的不同版本的表达方式,
     * 现实中,很多因素导致了这些不同版本表达方式的出现,
     *
     * 比如不同地方、不同群体的表达习惯, 不同的语言文化, 不同的表达场景,
     * 或者因为时间推移新版本代替旧版本,
     * 又或者你想给某一个事物命名, 你需要收集不同版本以供最终定夺.
     *
     * 不管是哪种情况, 这些不同版本的表达方式, 它们要表达的主体内容是一致的,
     * 你可以通过“多版本”的支持, 对同一条笔记, 实现同义词、多语言、多个修订版
     */
    versions?: UnitVersions

    /**
     * 当用户给某一条笔记创建一个版本时，被创建的版本会被独立保存成一条
     */
    // vof: KyString;

    /**
     * 被当前节点引用过的节点
     */
    referText?: KyString[]
    /**
     * 被当前节点嵌入过的节点
     */
    referBlock?: KyString[]
    referSnippet?: KyString[]
    /**
     * 被当前节点链接过的节点
     */
    mentions?: string[]

    /**
     * 节点添加了的标签
     */
    tags?: string[]

    childWordCount?: number
    /**
     * 当前的笔记是否为模板笔记
     */
    snippet?: SnippetProps
    SNIPPET?: LogicString
    /**
     * 若当前笔记是一个“笔记快照”, 它的原始ID是什么
     * 注意: 由于我们有了 `versions` 这个字段, 所以 `snapshot` 已经不再使用, 只作为兼容旧数据而存在
     */
    snapshot?: KyString

    /**
     * 节点是否折叠状态
     */
    foldup?: boolean

    /**
     * 子节点的视图模式
     * 例如: 你可以设置一个笔记的展示风格为: 思维导图、图表、表格、大纲笔记、Markdown等等
     */
    layout: string | { type: string; [k: string]: any }
    /**
     * 节点在不同视图环境之下的宽度
     */
    widths?: { [layout: string]: number }

    /**
     * 自定义样式数据
     */
    blockStyle?: {
      condition?: LogicString // 定义样式的应用条件
      styles?: string[] // 应用了的样式
    }

    /**
     * 其他元信息
     */
    meta?: {
      [key: string]: any
    }

    lock?: {
      locked: TimeSecond
    }
  }
}

export type KyItem = UnitPersist | KyString

export type UnitPropName = keyof UnitProps
export type UnitProps = {
  unitType: UnitType
  title: string | JSX.Element
  hidden?: UnitPropName[]
  id?: string
  icon?: PrimitiveIcon
  quote?: string
  body?: Partial<UnitProps>[]
  extra?: Partial<UnitProps>[]
  foot?: Partial<UnitProps>[] | React.FC
  mode?: UnitMode
  versions?: UnitVersions
  onClick?: (e: React.MouseEvent, ...args: any) => void
  onMouseDown?: (e: React.MouseEvent, ...args: any) => void
  render?: (params: Partial<UnitProps>) => JSX.Element | null
  foldup?: boolean
  cond?: (params?: any) => boolean
  [k: string]: any
}

export interface UnitPropsIcon {
  icon: PrimitiveIcon
  [k: string]: any
}
