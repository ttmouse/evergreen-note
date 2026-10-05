import React from 'react'
import { App, NewAddonParams, IAddon } from '../../engine/App'
import {
  ElementComponent,
  ElementComponentProps,
} from '../EditorView/EditorView'
import { SlashMenuItems } from '../SlashMenu/SlashMenu'
import { StrmapRuleInfo } from '../Strmap/Strmap'
import { after } from '../../engine/helper'
import { isEmpty } from '../../utils/isEmpty'
import { InlineElement } from '../Inlines/Inlines'
import { useElementHelperClasses } from './useElementHelperClasses'
import { useSlateRef } from '../../hooks/useSlateRef'
import { FormElProps } from '../Form/Form'
import { ItemMap } from '../DbMemory/DbMemory'
import { Item } from '../../interfaces/item'
import { nodeString } from '../../utils/string/nodeString'
import { LoadedAddonName } from '../../../main'
import { Node } from '../../slate.inc'

/**
 * Each type of Slate element should implement the IAddonElement interface
 */
export interface IAddonElement<T extends InlineElement> extends IAddon {
  /**
   * 该组件是不是黑盒元素
   */
  isVoid: (val: T) => boolean

  /**
   * 通过哪个字段来获取元素的值
   */
  valueKey?: string

  /**
   * Markdown 内容解析成笔记组件的数据格式
   */
  // fromMarkdown?: (md: string) => T | undefined;

  /**
   * toMarkdown 已被废弃，现在使用 exportString 方法，若标记为 rich，则会导出带格式的字符串
   */
  // toMarkdown?: () => MarkdownPatterns

  exportString?: (
    el: T,
    options: { item: UnitPersist; rich?: boolean }
  ) => string

  /**
   * 定义用于插入笔记组件的字符串映射规则
   */
  strmap?: () => StrmapRuleInfo

  /**
   * 生成笔记组件的数据
   */
  createElement: (props: any) => unknown

  /**
   * 创建用于渲染笔记组件的 React 视图组件
   */
  createComponent: () => ElementComponent<T>

  /**
   * 向斜杆菜单添加功能项
   */
  slashMenu: () => SlashMenuItems

  /**
   * 检查某值是否符合笔记组件元素的数据格式
   */
  verify: (val: T) => val is T

  fieldset?: () => { [k in keyof Partial<T>]: FormElProps<any> }
}

export type ElementDOM = HTMLElement & {
  $element: InlineElement
}

// 根据 item 中使用过的笔记组件，进生索引
declare global {
  interface MemoryIndexed {
    element: {
      [type: string]: ItemMap
    }
  }
}

/**
 * Element register
 * Once an addon implements the IAddonElement interface,
 * the ElementRegistry addon will automatically register the addon as a Slate element
 */

export function createElementRegistryAddon({ app, $ }: NewAddonParams) {
  class ElementRegistry<T extends InlineElement> implements IAddon {
    app!: App
    config = {}
    voids: { [elementName: string]: boolean } = {}
    addons: { [addonName: string]: IAddonElement<T> } = {}

    isAddonImplemented(addon: IAddon) {
      const methods = [
        // 'fromMarkdown',
        // 'strmap',
        'createElement',
        'createComponent',
        'slashMenu',
        'verify',
      ]
      return methods.every((m) => typeof (addon as any)[m] === 'function')
    }

    exportString(el: Node, options: { item: UnitPersist; rich?: boolean }) {
      const { rich = false } = options
      if ('blockType' in el === false) {
        const modifyLeafMarkdown = (str: string) => {
          const e = el as any
          if (e.bold) str = `**${str}**`
          if (e.underline) str = `<u>${str}</u>`
          if (e.strikethrough) str = `~~${str}~~`
          if (e.italic) str = `_${str}_`
          if (e.highlight) str = `==${str}==`
          if (e.code) str = `\`${str}\``
          return str
        }
        const basic = Node.string(el) || (el as any).value || ''
        if (rich) return modifyLeafMarkdown(basic)
        else return basic
      }
      const { blockType } = el as T
      if (blockType in $) {
        const k =
          (($ as any)[blockType] as any)?.exportString?.(el as T, options) ??
          Node.string(el)
        if (k) return k
      }
      return Node.string(el) || (el as any).value || ''
    }

    /**
     * 获取 item 或 笔记组件的值
     * @param el
     * @returns
     */
    getValue(el: UnitPersist | InlineElement) {
      if (Item.isItem(el)) {
        return (el.value ?? Item.headString(el)) as string
      }
      if (
        el.blockType in this.addons &&
        typeof this.addons[el.blockType].valueKey === 'string'
      ) {
        return (
          (el as any)[this.addons[el.blockType].valueKey!] ?? nodeString(el)
        )
      }
      return el?.value ?? nodeString(el)
    }

    /**
     * Register an element addon
     * @param addon
     */
    register(addon: IAddonElement<T>, addonName: string) {
      this.addons[addonName] = addon

      const { editorView, slashMenu, strmap, editorFactory, markdown } =
        this.app.addons

      const Comp = addon.createComponent()
      const NewComp = (props: ElementComponentProps<any>) => {
        const { attributes, element } = props
        const { ref: slateRef, ...restAttrs } = attributes
        const [domRef, mergedRef] = useSlateRef(slateRef)

        React.useEffect(() => {
          if (domRef.current) {
            Object.assign(domRef.current, {
              $element: element,
            })
          }
        })

        // Add some className to control the appearance of the element
        useElementHelperClasses(addonName, domRef, props)

        return <Comp {...props} attributes={{ ...restAttrs, ref: mergedRef }} />
      }

      editorFactory.addIsVoidMethod((val: any) => addon.isVoid(val))

      // Register the element's React component
      editorView?.addElementViews({
        [addonName]: NewComp,
      })

      // Register an item to Slash Menu for the element
      if ('slashMenu' in addon) {
        slashMenu?.addItems(addon.slashMenu())
      }

      if ('strmap' in addon) {
        // Register the string map rule for the element
        const rules = addon.strmap!()
        if (!isEmpty(rules)) {
          strmap?.addRules({
            [addonName]: rules,
          })
        }
      }

      if ('fieldset' in addon) {
        $.inlinesBar?.addInlineElementButton(addonName)
      }
    }

    addonBeforeRun() {
      /**
       * Check whether an element has implemented the IAddonElement interface,
       * If true, register it as a Slate element
       */
      after(app.execAddonRun, (_, addon: IAddon, addonName: string) => {
        if (
          $.elementRegistry.isAddonImplemented(addon) &&
          app.isAddonEnabled(addonName as LoadedAddonName)
        ) {
          $.elementRegistry.register(addon as any, addonName)
        }
      })

      // Object.assign($.dbMemory.indexes, {
      //   element: {
      //     unique: false,
      //     indexVal(item: UnitPersist) {
      //       const arr: string[] = [];
      //       if (Array.isArray(item.leaves)) {
      //         for (const leaf of item.leaves) {
      //           if ('blockType' in leaf) {
      //             arr.push((leaf as any).blockType);
      //           }
      //         }
      //       }
      //       return arr;
      //     },
      //   },
      // });
    }

    addonRun() {}
  }

  return new ElementRegistry()
}
