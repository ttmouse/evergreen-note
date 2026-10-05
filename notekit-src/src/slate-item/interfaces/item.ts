/* eslint-disable @typescript-eslint/no-use-before-define */
import {
  Descendant,
  Editor,
  Element,
  Location,
  Node,
  Path,
  Text,
  ReactEditor,
  NodeProps,
} from '../slate.inc'
import { omit } from '../utils/object/omit'
import { mkid, KYS, nanoid } from '../utils/string/mkid'
import {
  ItemEditor,
  ItemReference,
  ItemTransforms,
  KyString,
  UNIT_STATUS,
  UnitProps,
} from '..'
import { isEmpty } from '../utils/isEmpty'
import { time } from '../utils/date/time'
import { SYM_OWNER } from '../addons/DbMemory/DbMemory'
import { deepClone } from '../utils/object/deepClone'
import { pick } from '../utils/object/pick'
import { NewAddonParams } from '../engine/App'
import { ZERO_WIDTH_SPACE } from '../addons/Strmap/Strmap'
import { cleanString, trim } from '../utils/string/trim'
import { BLOCK_TYPE_BILINK } from '../addons/Bilink/Bilink'
import { nodeString } from '../utils/string/nodeString'
import { escapeRegExp } from '../utils/regexp'
import { unstable_GlobalApp } from '../../main'
import { ItemDOM } from '../components/ItemView'
import { formatTimeDelta, RepeatPlanProps, weekDayToStringForLLM } from '../addons/DateTool/Reminder/countdown'
import { ItemWithReminder } from '../addons/DateTool/Reminder/Reminder'

export type ItemId = string
export type ItemEntry = [ItemNode, Path]
export type IDPath = ItemId[]
export type KYPath = ItemId[]

export type ItemPartElement = {
  children: Descendant[]
  type: any
    // | 'node'
    // | 'node-head'
    // | 'node-subitems'
    // | 'node-body'
    // | 'node-extra'
    // | 'node-quote'
    // | 'node-text'
  [k: string]: any
}

export type ItemNode = Partial<Element> &
  Partial<ItemPartElement> &
  UnitPersist & {
    /**
     * The primitive Subitems from database
     * Which will be converted into the Slate's node tree.
     */
    subitems?: ItemNode[]

    /**
     * Various meta properties
     *
     * We can set various customized meta key in an item.
     * For a constraint, all meta key must start with a prefix `meta_`,
     * e.g. meta_city, meta_age ...
     *
     * A meta field can refer to other items
     * by setting a `ky` to the `REF` inside the meta field's value like below:
     * meta_tag: `{REF: 'us3a-dFa9A03a', val: 'cached value'}`.
     * In this way, we can build a relational database
     *
     * BTW: not only the meta field can refer to other items,
     * all of the fields, which have the value like `{REF: '...'}`,
     * will be considered that want to refer other items.
     */
    [meta_x: string]: unknown

    /**
     * Slate's Subitems
     */
    children: ItemNode[]

    GetSlPath: () => Path
    GetEditor: () => ItemEditor
    GetPlainText: () => string
    GetPrev: () => ItemNode | null
    GetNext: () => ItemNode | null
    GetParent(): ItemNode
    GetIndex: () => number
    GetNextAll: () => ItemNode[]
    GetPrevAll: () => ItemNode[]
    GetSubitems: () => ItemNode[]

    DoModify: (props: Partial<ItemNode>) => void
    DoFoldup: (willFoldup: boolean) => void
    DoRemove: () => void
    DoFocus: () => void
  } & Node

export function makeItemHead(
  makingItem: Pick<ItemNode, 'ky' | 'leaves' | 'ori' | 'quote'>
) {
  const children: Element[] = [makeItemText(makingItem)]
  if (!isEmpty(makingItem.quote)) {
    children.push(makeItemQuote(makingItem))
  }
  return {
    type: Item.partTypes.head,
    children,
  }
}

export function makeItemText(item: Pick<ItemNode, 'ky' | 'leaves' | 'ori'>) {
  let { leaves = [{ text: item.ori ?? '' }] } = item

  leaves = leaves.filter((el) => Node.isNode(el))

  const { refer } = unstable_GlobalApp.addons

  const newLeaves: Node[] = []
  for (const elOri of leaves) {
    const el = deepClone(elOri)
    const t = (el as any)?.blockType
    if (t === BLOCK_TYPE_BILINK) {
      newLeaves.push({
        ...el,
        children: (el as any).children.map((lf: Text) => ({
          ...lf,
          text: trim(lf.text).replaceAll(ZERO_WIDTH_SPACE, ''),
        })),
      })
    }
    // else if (t === 'refer') {
    //   newLeaves.push(...refer.getLinearLeaves((el as ReferElement).value))
    // }
    else if ('text' in el) {
      newLeaves.push({
        ...el,
        text: String(el.text),
      })
    } else {
      newLeaves.push(el)
    }
  }

  return {
    type: Item.partTypes.text,
    children: isEmpty(leaves) ? [{ text: '' }] : newLeaves,
  }
}

export function makeItemQuote(makingItem: Pick<ItemNode, 'quote'>) {
  return {
    type: Item.partTypes.quote,
    children: [{ text: makingItem.quote ?? '', quote: true }],
  }
}

function makeItemSubitems(makingItem: Partial<ItemNode>, editor: ItemEditor) {
  let children = [
    {
      type: Item.partTypes.outer,
      children: [{ text: '' }],
    } as any,
  ]

  if (makingItem.subitems) {
    children = makingItem.subitems.map((sub) => {
      // sub.$pid = makingItem.$id;
      return Item.make(sub, { editor })
    })
  }

  return {
    ky: makingItem.ky,
    type: Item.partTypes.subitems,
    $isTop: makingItem.$isTop,
    children,
  }
}

export function makeItemBody(
  makingItem: Partial<ItemNode>,
  editor: ItemEditor
) {
  return {
    ky: makingItem.ky,
    type: Item.partTypes.body,
    $isTop: makingItem.$isTop,
    children: [makeItemSubitems(makingItem, editor)],
  }
}

export function rangeToArray(editor: ItemEditor, at: Location) {
  return Array.from(Item.items(editor, at))
}

const IS_ITEM_LIST_CACHE = new WeakMap<any[], boolean>()

export const Item = {
  addonName: 'item',

  partTypes: Object.freeze({
    outer: 'node',
    head: 'node-head',
    body: 'node-body',
    subitems: 'node-subitems',
    child: 'node-subitems',
    text: 'node-text',
    quote: 'node-quote',
  }),

  /**
   * Build up a slate node
   *
   * @param oriItem
   * @param editor
   * @returns
   */
  make(
    oriItem: Partial<UnitPersist>,
    params: {
      editor: ItemEditor
      $isTop?: boolean
    }
  ): ItemNode {
    const { editor, $isTop = false } = params
    const ky = oriItem.ky ?? mkid()
    const item: ItemNode = {
      $id: oriItem.$id ?? `i${editor?.editorId ?? nanoid(4)}-${ky}`,
      ky,
      pky: oriItem.pky ?? KYS.UNKNOWN,
      type: Item.partTypes.outer,
      ori: oriItem.ori ?? '',
      $isTop,
      children: [makeItemHead(oriItem as ItemNode) as any],
      ...deepClone(omit(oriItem, ['text'] as any)),

      // Notice:
      // We CAN NOT define a getter here,
      // because it would cause a `RangeError`:
      // `Maximum call stack size exceeded`.
      // Thus just define normal GET functions

      // Uppercase the the first letter of a method
      // to avoid the naming conflicts between properties and methods,
      // and we let the properties' names start with lowercase letters

      /**
       * Find the item's path
       * @returns Path
       */
      GetSlPath(): Path {
        // First we try to find the path in the editor's selection,
        // if not found, then find it in the whole editor's node tree,
        // and eventually try to call ReactEditor.findPath() to find the path.
        try {
          const entry = editor.itemEntry(item.$id as string)
          if (entry) {
            return entry[1]
          }
          return ReactEditor.findPath(editor as any, item as any)
        } catch (e) {
          // Because `ReactEdtiro.findPath()` is not so reliable,
          // it is utilized as the final way
          return ReactEditor.findPath(editor as any, item as any)
        }
      },

      GetEditor(): ItemEditor {
        return editor
      },

      /**
       * Get the current item's index within its parent item
       * @returns
       */
      GetIndex(): number {
        return editor.itemIndex(item.GetSlPath())
      },

      /**
       * Get the current item's plain text, rather than its structured text data
       * @returns
       */
      GetPlainText(): string {
        return editor.itemTextPlain(item.GetSlPath())
      },

      /**
       * Get the next item
       * @returns
       */
      GetNext(): ItemNode | null {
        return editor.itemNext(item.GetSlPath())
      },

      /**
       * Get the previous item
       * @returns
       */
      GetPrev(): ItemNode | null {
        return editor.itemPrev(item.GetSlPath())
      },

      /**
       * Get the parent item
       * @returns
       */
      GetParent(): ItemNode {
        return editor.itemParent(item.GetSlPath())
      },

      /**
       * Get all of the items before current item within a same parent item
       * @returns
       */
      GetPrevAll(): ItemNode[] {
        let node = item
        const all: ItemNode[] = []
        while (node) {
          const prev = node.GetPrev()
          if (prev) {
            all.push(prev)
            node = prev
          } else {
            break
          }
        }
        return all
      },

      /**
       * Get all of the items after current item within a same parent item
       * @returns
       */
      GetNextAll(): ItemNode[] {
        let node = item
        const all: ItemNode[] = []
        while (node) {
          const next = node.GetNext()
          if (next) {
            all.push(next)
            node = next
          } else {
            break
          }
        }
        return all
      },

      /**
       * Get the Subitems whoes parent item is the current item
       * @returns
       */
      GetSubitems(): ItemNode[] {
        return (
          ((item.children[1] &&
            item.children[1].children[0].children) as any) || []
        )
      },

      // NOTICE:
      // As a good practice, all of the methods,
      // those would cause the changes to the current item,
      // shoud be named with a prefix `Do`,
      // so that we can easily know if a function would make changes,
      // and avoid the mess between an item's property and a item's method,
      // like `item.foldup` is a property,
      // and `item.Foldup()` would be messy with `item.foldup` while being used as a value `item.Foldup`,
      // so the naming `item.DoFoldup` is much more clear to `item.foldup`

      // We should never directly modify the item's properties,
      // insdead of that, we should always modify the item base upon the [[ItemTransforms]]' methods
      // this makes the changes can be tracked for undo & redo

      /**
       * Modify partial properties of the current item
       * NOTICE: only the pre-defined properties' changes would be applied to the item,
       * not allow to add new properties dynamically
       * @param props
       */
      DoModify(props: Partial<ItemNode>): void {
        ItemTransforms.setItems(editor, {
          at: item.GetSlPath(),
          props,
        })
      },

      /**
       * Foldup or expand the current item
       * `item.DoFoldup()` or `item.DoFoldup(true)` to foldup,
       * `item.DoFoldup(false)` to expand
       * @param willFoldup
       */
      DoFoldup(willFoldup = true): void {
        // ItemTransforms.foldupItems(editor, {
        //   at: item.GetSlPath(),
        //   foldup: willFoldup,
        // });
        editor.itemFoldup(willFoldup, item.GetSlPath())
      },

      /**
       * Remove the current item
       */
      DoRemove(): void {
        editor.itemRemove(item.GetSlPath())
      },

      DoFocus(): void {
        editor.itemFocusEnd(item.GetSlPath())
      },
    }

    // if (
    //   isEmpty(item.created) &&
    //   isEmpty(item.placeholder) &&
    //   isEmpty(item.ori) &&
    //   isEmpty(item.leaves)
    // ) {
    //   item.placeholder = `Type '/' for commands`;
    // }

    if (Array.isArray(item.subitems) && item.subitems.length > 0) {
      const itemBody = makeItemBody(item, editor)
      item.children.push(itemBody as any)
    }

    return item
  },

  resolvePkyAndWeight(item: Partial<ItemNode>): ItemNode {
    if (Array.isArray(item.subitems)) {
      item.ky ??= mkid()
      for (const [i, sub] of item.subitems.entries()) {
        sub.pky = item.ky
        sub.weight = (i + 1) * 1000
        sub.ky ??= mkid()
        Item.resolvePkyAndWeight(sub as ItemNode)
      }
    }
    return item as ItemNode
  },

  /**
   * 克隆一个 item
   * @param item
   * @param cloneKey 将 cloneKey 作为 ky 的后缀，以作为本次克隆的唯一标识,
   *                 这样在处理 summary 等场景时，比较容易将旧的ID对应到新ID中去
   * @returns
   */
  clone(item: UnitPersist, cloneKey?: string): UnitPersist {
    cloneKey ??= nanoid(5)
    
    // 首先收集所有要克隆的item的ky（包括根item和所有subitems）
    const collectAllKys = (itm: UnitPersist): Set<string> => {
      const kys = new Set<string>([itm.ky])
      if (Array.isArray(itm.subitems)) {
        for (const sub of itm.subitems) {
          const subKys = collectAllKys(sub as UnitPersist)
          subKys.forEach(ky => kys.add(ky))
        }
      }
      return kys
    }
    
    // 创建原始ky到新ky的映射
    const allKysInClone = collectAllKys(item)
    const kyMapping: { [oldKy: string]: string } = {}
    allKysInClone.forEach(ky => {
      kyMapping[ky] = cloneKy(ky, cloneKey!)
    })
    
    // 递归克隆函数，现在使用ky映射来处理引用
    const cloneWithMapping = (itm: UnitPersist, parentKy?: string): UnitPersist => {
      const { ky } = itm
      const newItem = omit(itm as any, [
        'crumbs',
        'path',
        'pky',
        'created',
        'updated',
        'children',
      ])
      
      newItem.ky = kyMapping[ky]
      newItem.clky = (itm as any).clky ?? ky // 记录克隆源的 ky
      
      if (parentKy) {
        newItem.pky = parentKy
      } else {
        delete newItem.pky
      }
      
      // 处理leaves，更新refer和embed的引用
      newItem.leaves = newItem.leaves.map((leaf: any) => {
        const newLeaf = { ...leaf }
        
        // 更新iky
        if (leaf.iky) {
          newLeaf.iky = cloneKy(leaf.iky, cloneKey!)
        }
        
        // 处理refer和embed类型的引用更新
        if (leaf.blockType === 'refer' || leaf.blockType === 'embed') {
          const refKey = leaf.refky || leaf.value
          // 只有当被引用的ky在当前克隆范围内时才更新引用
          if (refKey && kyMapping[refKey]) {
            newLeaf.value = kyMapping[refKey]
            if (newLeaf.refky) {
              newLeaf.refky = kyMapping[refKey]
            }
          }
          // 如果被引用的ky不在克隆范围内，保持原始引用
        }
        
        return newLeaf
      })

      if (typeof newItem.summary === 'object') {
        Object.assign(newItem, {
          summary: {
            start: cloneKy(newItem.summary.start, cloneKey!),
            end: cloneKy(newItem.summary.end, cloneKey!),
          },
        })
      }

      if (Array.isArray(newItem.subitems)) {
        const newSubitems: UnitPersist[] = []
        for (const sub of newItem.subitems) {
          const newSub = cloneWithMapping(sub as UnitPersist, newItem.ky)
          newSubitems.push(newSub)
        }
        newItem.subitems = newSubitems
      }
      
      return newItem as UnitPersist
    }
    
    return cloneWithMapping(item)
  },

  /**
   * Create a new item
   * @param item
   * @returns
   */
  newItem(item: Partial<UnitPersist>): UnitPersist {
    const ky = mkid()
    const theItem = {
      ky,
      pky: KYS.UNKNOWN,
      $id: `${ky}-${mkid()}`,
      path: [],
      ori: '',
      leaves: [{ text: item.ori ?? '' }],
      created: time(),
      updated: 0,
      layout: '',
      weight: time(),
      ...item,
    }

    return theItem
  },

  newTree(item: Partial<UnitPersist>): UnitPersist {
    const ky = mkid()
    const newItem = Item.newItem(item)
    if (!isEmpty(item.subitems)) {
      newItem.subitems = (item.subitems as UnitPersist[]).map((subItem) => {
        subItem.pky ??= ky
        return this.newTree(subItem)
      })
    }
    return newItem
  },

  /**
   * Check if a value is an outer element
   * @param value
   * @returns
   */
  isItemNode(value: any): value is ItemNode {
    return (
      Element.isElement(value) &&
      (value as ItemNode).type === Item.partTypes.outer
    )
  },

  isItem(value: any): value is UnitPersist {
    return (
      typeof value === 'object' &&
      typeof value.ky === 'string' &&
      (Node.isNodeList(value.leaves) || typeof value.ori === 'string')
    )
  },

  quoteString(item: UnitPersist) {
    if (!item) {
      return ''
    }
    return item?.quote ?? ''
  },

  dataFieldToStringMap: {
    created: (item: UnitPersist) => new Date(item.created * 1000).toLocaleString(),
    updated: (item: UnitPersist) => new Date(item.updated * 1000).toLocaleString(),
    reminder: (item: ItemWithReminder) => {
      const plan = item.reminder?.plans?.[0]
      if (!plan) return ''
      const NUM_TO_DAY_CN: Record<string, string> = {
        '0': '日', '1': '一', '2': '二', '3': '三', '4': '四', '5': '五', '6': '六',
      }
      const parts: string[] = []

      // --- Repeat + dueDate ---
      switch (plan.repeatPlan) {
        case 'once':
          parts.push(plan.dueDate!)
          break
        case 'interval':
          if (plan.step === 1 && plan.stepUnit === 'day') {
            parts.push(`从${plan.dueDate}开始 每天`)
          } else {
            const unitMap: Record<string, string> = { day: '天', week: '周', month: '月', year: '年' }
            parts.push(`从${plan.dueDate}开始 每${plan.step}${unitMap[plan.stepUnit!] ?? plan.stepUnit}`)
          }
          break
        case 'weekly': {
          const days = [...plan.dayOfWeek!.map(d => String(d))]
            .map(d => NUM_TO_DAY_CN[d] ?? d)
            .join('')
          parts.push(`从${plan.dueDate}开始 每周${days}`)
          break
        }
        case 'monthly':
          parts.push(`从${plan.dueDate}开始 每月${plan.dayOfMonth === 'end' ? '末' : plan.dayOfMonth}`)
          break
        case 'yearly':
          parts.push(`从${plan.dueDate}开始 每年`)
          break
      }

      // --- Time ---
      if (plan.timeSensitive) {
        parts.push(plan.time)
      }

      // --- TimeDelta ---
      if (plan.timeDelta) {
        const deltas = plan.timeDelta.split(/[,，]/).map(s => s.trim()).filter(s => s && s !== '0')
        parts.push(...deltas)
      }

      return parts.join(' ')
    },
    path: (item: UnitPersist) => {
      return item.path.map(p => {
        const pitem = unstable_GlobalApp.addons.dbMemory.getItem(p)
        return pitem ? `${Item.headString(pitem, { parseRefer: true, rich: true })}(ky:${p})` : ""
      }).filter(e => !!e).join(' / ')
    },
  },

  /**
   * Get an item's string without its body content
   * @param item
   * @returns
   */
  headString(
    item: UnitPersist,
    options?: {
      parseRefer: boolean, // whether to read linked content from block reference、 page reference、embed block
      rich?: boolean, // whether to keep some rich text format like **bold**, _italic_ ...
      metaDataForLLM?: (string | ((item: UnitPersist) => string))[] // which meta fields to be included in the string for LLM
    }
  ) {
    // FIXME: 这是使用了 unstable_GlobalApp, 这是不建议使用的
    const $ = unstable_GlobalApp.addons
    const { parseRefer = false, rich = false } = options ?? {}

    if (isEmpty(item)) {
      return ''
    }

    // 后续可以抽成模块

    const addMetaDataForLLM = (str: string) => {
      const { metaDataForLLM = [] } = options ?? {}
      if (metaDataForLLM.length === 0) return str
      const metaStr = metaDataForLLM.map((key) => {
        if (typeof key === 'function') {
          return key(item)
        }
        const val = (item as any)[key]
        if (['ori', 'leaves'].includes(key)) return ''
        if (key in Item.dataFieldToStringMap) {
          return `${key}: ${(Item.dataFieldToStringMap as Record<string, (val: unknown) => string>)[key](item)}`
        }
        if (val === undefined) return ''
        return `${key}: ${String(val)}`
      }).filter(e=>!!e).join(' | ')
      return `<!-- ${metaStr} --> ${str}`
    }

    const modifyBlockMarkdown = (inp: string) => {
      if (!rich) return inp;
      switch (item.blockType) {
        case 'h1':
          return `# ${inp}`
        case 'h2':
          return `## ${inp}`
        case 'h3':
          return `### ${inp}`
        case 'h4':
          return `#### ${inp}`
        case 'h5':
          return `##### ${inp}`
        case 'h6':
          return `###### ${inp}`
        case 'blockquote':
          return `> ${inp.replace(/\n/g, '\n> ')}`
        case 'divider':
          return `---${inp?'\n'+inp:''}`
        default:
          return inp
      }
    }

    // console.log(item, isEmpty(item), Object.keys(item))
    if (Array.isArray(item.leaves) && Node.isNodeList(item.leaves)) {
      const str = item.leaves.map((leaf) => {
        if ((!parseRefer) && ("blockType" in leaf && ['refer', 'embed', 'bilink'].includes(leaf.blockType as string))) {
          const lf = leaf as any;
          if(lf.note) return ` ${lf.note} `;
          else if(lf.children) return Node.string({children:(leaf as any).children});
          else return ""
        }
        // return Node.string({ children: item.leaves });
        return $.elementRegistry.exportString(leaf as any, { item, rich })
      })
      return cleanString(addMetaDataForLLM(modifyBlockMarkdown(str.join(''))))
    }
    if (typeof item.ori === 'string') {
      return cleanString(addMetaDataForLLM(modifyBlockMarkdown(item.ori)))
    }
    return ''
  },

  bodyString(item: UnitPersist, options?: { parseRefer: boolean }) {
    const str: string[] = []
    if (!isEmpty(item.subitems)) {
      for (const sub of item.subitems!) {
        str.push(Item.headString(sub as UnitPersist, options))
        str.push(Item.bodyString(sub as UnitPersist, options))
      }
    }
    return str.join('\n')
  },

  blockString(item: UnitPersist, options?: { parseRefer: boolean, rich?: boolean }) {
    return [
      Item.headString(item, options),
      Item.quoteString(item),
      Item.bodyString(item, options),
    ].join('\n')
  },

  toUnit(item: UnitPersist): UnitProps {
    return {
      title: Item.headString(item),
      unitType: 'List',
      body: !isEmpty(item.subitems)
        ? (item.subitems as any).map(Item.toUnit)
        : [],
    }
  },

  /**
   * Check if a value is a topic item
   * @param value
   * @returns
   */
  isTopic(value: any): boolean {
    return this.canPersist(value) && !!value.topic
  },

  /**
   * Check if a value is a normal item
   * @param value
   * @returns
   */
  isNormalStatus(value: UnitPersist): boolean {
    return (
      this.canPersist(value) &&
      value.status !== UNIT_STATUS.TRASH &&
      value.status !== UNIT_STATUS.ELIMINATED &&
      value.status !== UNIT_STATUS.TEMP &&
      value.status !== UNIT_STATUS.HIDDEN
    )
  },

  isTextEmpty(item: UnitPersist) {
    const result = Item.headString(item).trim().length === 0
    if (!result) {
      return false
    }
    for (const sub of item.subitems ?? []) {
      const r = Item.isTextEmpty(sub as UnitPersist)
      if (!r) {
        return false
      }
    }
    return true
  },

  getSubRequirementByParentLayout(layout: string | undefined): Partial<UnitPersist> {
    if (!layout) return {}
    switch (layout) {
      case 'flexmap':
        return {
          $crumbsContext: undefined,
          layout: ''
        } as any
      case 'result':
        return {
          layout: 'item-group',
          $crumbsContext: 'group',
        } as any
      default:
        return {
          layout: ''
        }
    }
  },

  /**
   * Group items by their topic item
   * @param items
   * @returns
   */
  groupItemsByTopic(
    items: UnitPersist[],
    options: {
      foldupAll?: boolean // 折叠列表中的所有主题
      foldupSome?: string[] // 折叠列表中的指定主题
      parentLayout?: string
    } = {} as any,
  ) {
    const { foldupAll, foldupSome, parentLayout } = options
    const groups: { [key: string]: UnitPersist } = {}
    const extraInfo = this.getSubRequirementByParentLayout(parentLayout)
    items.forEach((item) => {
      if (!isEmpty(item.topic)) {
        groups[item.ky] ??= {
          ...pick(item, ['leaves', 'ori', 'ky']),
          layout: 'item-group',
          $groupKy: item.ky,
          $crumbsContext: 'result',
          $readonly: true,
          $isTmp: true,
          icon: 'svg_arrow_down',
          foldup: foldupAll || foldupSome?.includes(item.ky),
        } as any
        Object.assign(groups[item.ky], extraInfo)
      } else if ((item as any)[SYM_OWNER]) {
        const topicItem = (item as any)[SYM_OWNER] as UnitPersist
        groups[topicItem.ky] ??= {
          ...pick(topicItem, ['leaves', 'ori']),
          // ky: `tmp-${mkid()}`,
          ky: topicItem.ky,
          layout: 'item-group',
          $groupKy: topicItem.ky,
          $crumbsContext: 'result',
          $readonly: true,
          $isTmp: true,
          foldup: foldupAll || foldupSome?.includes(topicItem.ky),
          icon: 'svg_arrow_down',
        } as any
        Object.assign(groups[topicItem.ky], extraInfo)
        ;(groups[topicItem.ky] as any).subitems ??= [] as UnitPersist[]
        ;(groups[topicItem.ky] as any).subitems.push(item)
      }
    })
    return Object.values(groups)
  },

  /**
   * Check if an item can be saved to database
   * 检查一个 item 是否有效的可持久化数据
   * @param value
   * @returns
   */
  canPersist(value: any): value is ItemNode {
    return !Item.isTmpItem(value) && 'ky' in value && 'pky' in value
  },

  isNewItem(val: any): boolean {
    return (
      Item.isItemNode(val) &&
      isEmpty(val.$isTmp) &&
      isEmpty(val.updated) &&
      isEmpty(val.path)
    )
  },

  isParentsTmpByDom(item: ItemNode): { parentIsTmp: boolean; grandParentIsTmp: boolean } {
    const result = {
      parentIsTmp: false,
      grandParentIsTmp: false,
    }
    const id = item.$id;
    if (!id) return result;
    const ele = document.getElementById(id);
    if (!ele) return result;
    result.parentIsTmp = !!(ele.parentElement?.parentElement?.parentElement as ItemDOM)?.$item?.$isTmp;
    result.grandParentIsTmp = !!(ele.parentElement?.parentElement?.parentElement?.parentElement?.parentElement?.parentElement as ItemDOM)?.$item?.$isTmp
    return result;
  },

  // isParentsTmp(item: ItemNode): { parentIsTmp: boolean; grandParentIsTmp: boolean } {
  //   let parentIsTmp: boolean = false, grandParentIsTmp: boolean = false;
  //   try {
  //     let parent = item.GetParent?.();
  //     parentIsTmp = !!(parent?.$isTmp);
  //     grandParentIsTmp = !!(parent?.GetParent?.().$isTmp);
  //   } catch (e) {
  //     parentIsTmp = false;
  //     grandParentIsTmp = false;
  //   }
  //   return { parentIsTmp, grandParentIsTmp }
  // },

  editorIsParentTmp(editor: ItemEditor) {
    try {
      const item = editor.item();
      return this.isParentsTmpByDom(item)
    } catch (e) {
      return { parentIsTmp: false, grandParentIsTmp: false }
    }
  },


  isTmpItem(val: { [k: string]: any }): boolean {
    return isEmpty(val) || val.isTmp || val.$isTmp || val.ky?.startsWith('tmp-')
  },

  hasParent(item: UnitPersist): boolean {
    return (
      typeof item.pky === 'string' &&
      !Object.values(KYS).includes(item.pky as any)
    )
  },

  trimLeaves(leaves: Node[]) {
    // if (isEmpty(leaves)) {
    //   return []
    // }
    // const newLeaves = [...leaves]
    // while (
    //   newLeaves.length > 0 &&
    //   Text.isText(newLeaves[0]) &&
    //   isEmpty(newLeaves[0].text)
    // ) {
    //   newLeaves.shift()
    // }
    // while (
    //   newLeaves.length > 0 &&
    //   Text.isText(newLeaves[newLeaves.length - 1]) &&
    //   isEmpty((newLeaves[newLeaves.length - 1] as Text).text)
    // ) {
    //   newLeaves.pop()
    // }
    // return newLeaves
    return leaves?.filter((leaf) => !Text.isText(leaf) || leaf.text.length > 0)
  },

  /**
   * Check if a value is an item list
   * @param value
   * @returns
   */
  isItemList(value: any): value is ItemNode[] {
    if (!Array.isArray(value)) {
      return false
    }
    const cachedResult = IS_ITEM_LIST_CACHE.get(value)
    if (cachedResult !== undefined) {
      return cachedResult
    }
    const isItemList = value.every((val) => Item.isItemNode(val))
    IS_ITEM_LIST_CACHE.set(value, isItemList)
    return isItemList
  },

  /**
   * Check if a value can be used to find an item in the editor
   * @param value
   * @returns
   */
  isItemReference(value: any): value is ItemReference {
    return (
      Location.isLocation(value) ||
      Item.isItemNode(value) ||
      (Array.isArray(value) &&
        Item.isItemNode(value[0]) &&
        Path.isPath(value[1])) ||
      typeof value === 'undefined'
    )
  },

  /**
   * Check whether a value is an itemEntry
   * @param entry
   * @returns
   */
  isItemEntry(value: any): boolean {
    return (
      Array.isArray(value) &&
      Element.isElement(value[0]) &&
      Path.isPath(value[1])
    )
  },

  isLeavesEmpty(item: UnitPersist) {
    return (
      Item.headString(item).length < 1 &&
      (isEmpty(item?.leaves) || item.leaves.length < 2)
    )
  },

  /**
   * 检查节点是否以某一个类型的元素作为开头
   * @param item
   * @param type
   * @returns
   */
  startsWithElement(item: UnitPersist, type: string): NodeProps | false {
    if (isEmpty(item.leaves)) {
      return false
    }
    if (!isEmpty(nodeString(item.leaves[0]))) {
      return false
    }
    return (item.leaves[1] as any)?.blockType === type
  },

  endsWithElement(item: UnitPersist, type: string) {
    if (isEmpty(item.leaves) || item.leaves.length < 2) {
      return false
    }
    if (!isEmpty(nodeString(item.leaves[item.leaves.length - 1]))) {
      return false
    }
    return (item.leaves[item.leaves.length - 2] as any)?.blockType === type
  },

  startsWithText(item: UnitPersist, text: string) {
    if (isEmpty(item.leaves)) {
      return false
    }
    return new RegExp(`^${escapeRegExp(text)}`).test(nodeString(item.leaves[0]))
  },

  *items(
    editor: ItemEditor,
    at: Location,
    options: {
      recur?: boolean
    } = {}
  ): Generator<ItemEntry, void, undefined> {
    const { recur = false } = options
    const cache: any = []
    for (const [, path] of Editor.nodes(editor, {
      at,
      match: (n) => (n as any).type === Item.partTypes.head,
    })) {
      const entry = editor.itemEntry(path)
      if (!recur) {
        const parentPath = editor.itemPathParent(entry[1]).join(',')
        if (cache.some((c: string) => parentPath.startsWith(c))) {
          continue
        }
      }

      cache.push(entry[1].join(','))
      yield entry as ItemEntry
    }
  },
}

export function createItemAddon({ app, $ }: NewAddonParams) {
  Object.assign(Item, {
    app,
    config: {},
  })
  return Item
}

export type ItemPartType = typeof Item.partTypes

const cloneRegexp = /(.+?)(_cp_)([0-9a-z_-]{5})$/i
export function cloneKy(ky: KyString, cloneKey: string) {
  if (cloneKey.length !== 5) {
    throw new Error(`cloneKey must be 5 chars length`)
  }
  const match = cloneRegexp.exec(ky)
  if (match) {
    return `${match[1]}${match[2]}${cloneKey}`
  }
  return `${ky}_cp_${cloneKey}`
}

export function oriKy(ky: KyString) {
  return ky.replace(cloneRegexp, '$1')
}
