/* eslint-disable @typescript-eslint/no-use-before-define */
import { Item, ItemNode } from '../../interfaces/item'
import { App } from '../../engine/App'
import {
  isItem,
  itemToHtml,
  itemToJson,
  itemToMarkdown,
  itemToOpml,
  itemToPlain,
  omitItemKeys,
} from './helper'

export type ExportHandlerParamsIn = {
  app?: App
  data: UnitPersist
  item: ItemNode
  [k: string]: unknown
}

export type ExportHandlerParams = ExportHandlerParamsIn & {
  app: App
}

/**
 * Define the export type
 */
export type ExportTypeInfo = {
  /**
   * A user oriented title
   */
  title: string
  /**
   * The file extension
   * @example 'json'
   */
  type: string
  /**
   * The handler function to convert data to string
   * @param params
   * @returns string
   */
  handle: (params: ExportHandlerParams) => string
}

export const exportTypes = {
  fulljson: {
    type: 'json',
    title: 'JSON(RE)',
    handle({ data }: ExportHandlerParams) {
      if (!isItem(data)) {
        throw new Error('data must be a single object')
      }

      const toJson = (item: Partial<UnitPersist>) => {
        const newItem = omitItemKeys(item as UnitPersist)
        if (Array.isArray(item.subitems)) {
          newItem.subitems = item.subitems.map(toJson)
        }
        return newItem
      }
      return JSON.stringify(toJson(data), null, 2)
    },
  },

  // rr format
  // json: {
  //   type: 'json',
  //   title: 'JSON(RR)',
  //   handle({ data }: ExportHandlerParams) {
  //     const jsonData = {
  //       title: Item.headString(data),
  //       ...itemToJson(data),
  //     }
  //     return JSON.stringify(jsonData, null, 2)
  //   },
  // },

  // compress: {
  //   type: 'json',
  //   title: 'JSON(RE) Compressed',
  //   handle({ data }: ExportHandlerParams) {
  //     return JSON.stringify(compress(data), null, 2);
  //   },
  // },

  markdown: {
    type: 'md',
    title: 'Markdown',
    handle({ data, app }: ExportHandlerParams) {
      const convert = app.addons.markdown.itemToMarkdown
      return itemToMarkdown(data, 0, { convert })
    },
  },

  // opml: {
  //   type: 'opml',
  //   title: 'OPML',
  //   handle({ data }: ExportHandlerParams) {
  //     return itemToOpml(data)
  //   },
  // },

  plain: {
    type: 'txt',
    title: 'Plain text',
    handle({
      data,
      ...options
    }: ExportHandlerParams & { indentLevel?: number }) {
      return itemToPlain(data, options)
    },
  },

  // html: {
  //   title: 'HTML',
  //   type: 'html',
  //   handle({
  //     data,
  //     htmlTag = 'ul',
  //   }: ExportHandlerParams & { htmlTag?: 'ol' | 'ul' }) {
  //     return itemToHtml(data, htmlTag)
  //   },
  // },
}
