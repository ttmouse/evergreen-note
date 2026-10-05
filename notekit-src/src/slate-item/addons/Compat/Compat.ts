/* eslint-disable prefer-destructuring */
import { IAddon, App, NewAddonParams } from '../../engine/App'
import { cover, after } from '../../engine/helper'
import { Node } from '../../slate.inc'
import { convertText, ConvertTextRule } from './helper'
import { recur } from '../../utils/recur'
import { isEmpty } from '../../utils/isEmpty'
import { attr2obj } from '../../utils/string/attr'
import { isUrl } from '../../utils/regexp'
import { isValidKy, nanoid } from '../../utils/string/mkid'
import { Item } from '../../interfaces/item'
import { browser } from '../../utils/browser'

/**
 * Convert item from v1 to v2
 */
export class Compat implements IAddon {
  app!: App
  config = {}

  getInlineRules(): { [k: string]: ConvertTextRule } {
    const a = this.app.addons
    return {
      // Mermaid 和 Table 要先于代码块解析
      mermaid: {
        regexp: /(^```mermaid\n.+?\n^```)/gms,
        to: (s: string) => {
          const result = /^```mermaid\n(.+)\n^```/gms.exec(s)
          return a.mermaidGraph.createElement({
            value: result?.[1] ?? '',
          })
        },
      },
      mdtable: {
        regexp: /(^```table\n.+?\n^```)/gms,
        to: (s: string) => {
          const result = /^```table\n(.+)\n^```/gms.exec(s)
          return a.mdTable.createElement({
            value: result?.[1] ?? '',
          })
        },
      },
      htmltable: {
        regexp: /(^<table[\s\S]+?<\/table>)/gms,
        to: (s: string) => {
          return a.mdTable.createElement({
            value: s,
          })
        },
      },
      // 代码块
      codeblock: {
        regexp: /(^```.+?^```)/gms,
        to: (s: string) => {
          const result = /^```(.*?)\n(.+)\n^```/gms.exec(s)
          const { langName, mode } = a.codeblock.searchForLang(result?.[1]?.trim() ?? '')
          return a.codeblock.createElement({
            langName,
            mode,
            value: result?.[2] ?? '',
          })
        },
      },
      // 行内代码
      code: {
        regexp: /(`[^\n]+?`)/,
        to: (s: string) => {
          return {
            code: true,
            text: s.replace(/(^`|`$)/g, ''),
          }
        },
      },
      // 图片要先于链接解析
      img: {
        regexp: /(!\[.*?\]\(.+?\))/,
        to: (s: string) => {
          const match = /\[(.*?)\]\((.+?)\)/.exec(s)!
          return a.img.createElement({
            src: match[2],
            title: match[1],
          })
        },
      },
      // 超链接
      // 超链接与图片要放到 italic 之前，因为 italic 也是是双斜杆 // 的，
      // 会导致超链接和图片的双斜杆被误认为是 italic
      hyperlink: {
        regexp: /(\[.+?\]\(.+?\))/,
        to: (s: string) => {
          const match = /\[(.+?)\]\((.+?)\)/.exec(s)!
          return a.hyperlink.createElement({
            url: match[2],
            title: match[1],
          })
        },
      },
      // 元信息
      // label: {
      //   regexp: /(\w{1,20}::|[\u4e00-\u9fa5]{1,8}::)/,
      //   to: (s: string) => {
      //     const match = /(\w{1,20}|[\u4e00-\u9fa5]{1,8})::/.exec(s)!
      //     return {
      //       label: true,
      //       text: match[1],
      //     }
      //   },
      // },

      // 双向链接
      bilink: {
        regexp: /(\[\[[^\n]+?\]\])/,
        to: (s: string) => {
          const topic = s.replace(/(^\[\[|\]\]$)/g, '')
          return a.bilink?.createElement({ topic })
        },
      },
      // 块引用
      refer: {
        regexp: /(\(\([0-9a-z_-]+(?:\s+.*?)?\)\))/i,
        to: (s: string) => {
          const [, refky, , note] = /\(\(([a-z0-9_-]+)(\s+(.+?))?\)\)/i.exec(s)!
          return a.refer.createElement({ ky: refky, note })
        },
      },
      // Latex
      latex: {
        regexp: /(\$\$.+?\$\$)/,
        to: (s: string) =>
          a.latex.createElement({
            value: s.replace(/^[$]{1,2}|[$]{1,2}$/g, ''),
          }),
      },
      latex2: {
        regexp: /(\$.+?\$)/,
        to: (s: string) =>
          a.latex.createElement({
            value: s.replace(/^[$]{1,2}|[$]{1,2}$/g, ''),
          }),
      },
      latex3: {
        regexp: /(\\[\(\[)].+?\\[\]\)])/gms,
        to: (s: string) =>
          a.latex.createElement({
            value: s.replace(/^\\[\[\(]/g, '').replace(/\\[\]\)]/g, ''),
          }),
      },
      
      // 删除线
      strokethrough: {
        regexp: /(~~[^\n]+?~~)/,
        to: (s: string) => {
          return {
            strikethrough: true,
            text: s.replace(/(^~~|~~$)/g, ''),
          }
        },
      },
      // 高亮
      highlight: {
        regexp: /(==[^\n]+?==)/,
        to: (s: string) => {
          return {
            highlight: true,
            text: s.replace(/(^==|==$)/g, ''),
          }
        },
      },
      // 下划线
      underline: {
        regexp: /(__[^\n]+?__)/,
        to: (s: string) => {
          return {
            underline: true,
            text: s.replace(/(^__|__$)/g, ''),
          }
        },
      },
      // 加粗
      bold: {
        regexp: /(\*\*[^\n]+?\*\*)/,
        to: (s: string) => {
          return {
            bold: true,
            text: s.replace(/(^\*\*|\*\*$)/g, ''),
          }
        },
      },
      // 斜体
      italic: {
        regexp: /(\/\/[^\n]+?\/\/)/,
        to: (s: string) => {
          // 保护链接中存在的 :// 字符
          if (s.startsWith('://') || s.endsWith('://')) {
            return s
          }
          return {
            italic: true,
            text: s.replace(/(^\/\/|\/\/$)/g, ''),
          }
        },
      },
      italic2: {
        // regexp: /(?<!\w)(_[^_]+_)(?!\w)/,
        regexp: browser.legacySafari ? new RegExp('_([^_]+)_') : new RegExp('(?<!\\w)(_[^_]+_)(?!\\w)'),
        to: (s: string) => {
          return {
            italic: true,
            text: s.replace(/(^_|_$)/g, ''),
          }
        },
      },
      italic3: {
        // regexp: /(?<!\w)(\*[^*]+\*)(?!\w)/,
        regexp: browser.legacySafari ? new RegExp('\\*([^*]+)\\*') : new RegExp('(?<!\\w)(\\*[^*]+\\*)(?!\\w)'),
        to: (s: string) => {
          return {
            italic: true,
            text: s.replace(/(^\*|\*$)/g, ''),
          }
        }
      },

      // 行内附注
      note: {
        regexp: /(\{\w+?\}|\{:.+?\}|\{\w+:.+?\})/i,
        to: (s: string, result: (string | Node)[], i: number) => {
          // eslint-disable-next-line prefer-const
          let [, format = 'default', note] = /\{(\w+?)?(:.+?)?\}/i.exec(s)!
          const map = { r: 'red', g: 'green', b: 'blue', y: 'yellow' }
          if (format in map) {
            format = (map as any)[format]
          }
          const prev = i - 1
          if (i > 0 && Node.isNode(result[prev])) {
            ; (result[prev] as any).format = format
            if (note) {
              ; (result[i - 1] as any).note = note.replace(/^:/, '')
            }
            return { text: '' }
          }
          return s
        },
      },
      task: {
        regexp: /(^\[x?\]\s+|^\[\s*\]\s+|^\]\s+)/i,
        to: (s: string) => {
          const value = s.toLowerCase() === '[x] '
          return a.checkbox.createElement({ value })
        },
      },
      embed: {
        regexp: /(\{\{embed\s+[^\n]+?\}\})/i,
        to: (s: string) => {
          const match = /\{\{embed\s+([^\n]+?)\}\}/i.exec(s)!
          let params = {} as any
          if (match[1]?.includes('=')) {
            params = attr2obj(match[1])
          } else {
            params.src = match[1]
          }
          if (!isUrl(params.src) && isValidKy(params.src)) {
            return a.embed.createElement({ ky: params.src })
          }
          return a.embedweb.createElement(params)
        },
      },
      tag: {
        regexp: new RegExp(`(#[^#\\s]+|^#[^#\\s]+)`),
        // new RegExp(`((?<=[\\s+\u200b\u4e00-\u9fa5])#[^#\\s]+|^#[^#\\s]+)`),
        to: (s: string) => {
          if (s.startsWith('#')) {
            const spt = s.split(/[?!,.？。，！<>\]\[\(\)\{\}\|\\\/\-\*:@$%^&*+=;"'\s]/);
            if(/^#\d+\.?(\d)*$/.test(spt[0])) return s;
            return this.app.addons.tag.createElement({ tag: s })
          }
          return s
        },
      },
      naturalLink: {
        regexp: /(https?:\/\/\S+)/,
        to: (s: string) => {
          return a.hyperlink.createElement({
            url: s,
            title: s,
          })
        },
      }
    }
  }

  getBlockRules() {
    return {
      // 1～6 标题
      header: {
        regexp: /^#+\s+/,
        to: (item: UnitPersist) => {
          const match = /(^#+)\s+(.+)/.exec(Item.headString(item))!
          return {
            ...item,
            ori: match[2],
            blockType: `h${match[1].length}`,
          }
        },
      },
      // 引述
      blockquote: {
        regexp: /^>+\s+/,
        to: (item: UnitPersist) => {
          const match = /^>+\s+(.*)/.exec(Item.headString(item))!
          return {
            ...item,
            ori: match[1],
            blockType: 'blockquote',
          }
        },
      },
      // 分隔线
      divider: {
        regexp: /^---/,
        to: (item: UnitPersist) => {
          return {
            ...item,
            ori: '',
            blockType: 'divider',
          }
        },
      },
    }
  }

  convertText(item: UnitPersist, mdStr: string) {
    return convertText(item, mdStr, Object.values(this.getInlineRules()))
  }

  convertItem(itemV1: UnitPersist, applyBlockRules = true): UnitPersist {
    let itemV2 = { ...itemV1 }
    if (applyBlockRules) {
      for (const rule of Object.values(this.getBlockRules())) {
        if (rule.regexp.test(itemV2.ori ?? '')) {
          itemV2 = rule.to(itemV2)
        }
      }
    }
    itemV2.leaves ??= this.convertText(itemV2, itemV2.ori ?? '')
    return itemV2
  }

  /**
   * Check if an item is from v1
   * @param item
   */
  isItemV1(item: UnitPersist) {
    return (
      typeof item === 'object' &&
      'leaves' in item === false &&
      typeof item?.ori === 'string'
    )
  }

  addonBeforeRun() {
    const { imports, editorView, compat, dbMemory } = this.app.addons

    // Convert item from v1 to v2 while importing
    const { importItem } = imports
    cover(importItem, (item, dbid) => {
      if (compat.isItemV1(item)) {
        Object.assign(item, compat.convertItem(item))
      }
      return importItem.call(imports, item, dbid)
    })

    // Convert item from v1 to v2 before rendering
    after(editorView.getItem, (result) => {
      recur(result as any, (item: any) => {
        if (compat.isItemV1(item)) {
          const v2item = { ...item, ...compat.convertItem(item) }
          dbMemory.saveItem(v2item)
        }
      })
      return result
    })
  }

  addonRun() { }
}

export function createCompatAddon({ app, $ }: NewAddonParams) {
  return { compat: new Compat() }
}
