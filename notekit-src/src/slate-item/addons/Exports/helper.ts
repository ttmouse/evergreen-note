/* eslint-disable prefer-template */
/* eslint-disable @typescript-eslint/no-use-before-define */
import { Item } from '../../interfaces/item'
import { isEmpty, notEmpty } from '../../utils/isEmpty'
import dayjs from 'dayjs'
import { loadScript } from '../../utils/dom/loadScript'
import { omit } from '../../utils/object/omit'
import { key2k, k2key } from './k2k'
import { Node } from '@/slate-item/slate.inc'

const checkItem = (item: UnitPersist) => {
  const cond =
    typeof item === 'object' &&
    typeof item.ky === 'string' &&
    (Array.isArray(item.leaves) || typeof item.ori === 'string')
  if (!cond) {
    throw new Error(`item must be a single object`)
  }
}

export const isItem = (item: UnitPersist) => {
  return (
    typeof item === 'object' &&
    typeof item.ky === 'string' &&
    (Array.isArray(item.leaves) || typeof item.ori === 'string')
  )
}

export function omitItemKeys(item: UnitPersist) {
  const shouldOmit = [
    'layout',
    'ikys',
    'mentionCount',
    'referText',
    'referBlock',
    'mentions',
    'foldup',
  ]
  return omit(item, (k, v) => {
    return (
      ['crumbs', 'mentions', 'text', 'json', 'path'].includes(k) ||
      k.startsWith('$') ||
      (k === 'ori' && notEmpty(item.leaves)) ||
      (isEmpty(v) && shouldOmit.includes(k))
    )
  })
}

export function itemToPlain(
  item: UnitPersist,
  options: { withLine?: boolean; indentLevel?: number; level?: number, rich?: boolean } = {}
) {
  checkItem(item)
  const { withLine = false, indentLevel = 1, level = 0, rich = false } = options
  if (isEmpty(item)) {
    return ''
  }
  let text = Item.headString(item, { parseRefer: true, rich }).trim()
  const list = item.subitems as UnitPersist[]
  text = text.replace(/\{\{(embed|search)\s.+\}\}/g, '').trim() + '\n'

  const lv = !isEmpty(text) ? level : level - 1

  let t = ''
  if (lv >= indentLevel) {
    t = '  '.repeat(lv - indentLevel)
    if (text.length > 0) {
      text = t + text
    }
    // text += '\n'
  } else if (withLine) {
    text += '\n---------------------------\n\n'
  }

  if (!isEmpty(item.quote)) {
    text += `${t}  \`${item.quote}\`\n`
  }

  if (!isEmpty(list)) {
    for (const sub of list) {
      const sText = itemToPlain(sub, { ...options, level: lv + 1 })
      if (sText.trim().length > 0) {
        text += sText
      }
    }
  }
  return text
}

export function itemToMarkdown(
  item: UnitPersist,
  level = 0,
  options: { convert: (item: UnitPersist) => string } = {} as any
) {
  const { convert = (one) => Node.string({ children: one.leaves }) } = options

  checkItem(item)

  if (isEmpty(item)) {
    return ''
  }

  let text = convert(item)

  const list = item.subitems as UnitPersist[]

  let t = ''
  if (level > 0) {
    t = '\t'.repeat(level - 1)
    text = text.trim()
    if (text.length > 0) {
      text = "- " + text
      // && /^(#+|>|&gt;)\s+/.test(text) === false 标题引述
      // && /^-{3,}$/.test(text) === false 分隔线
      if (level > 1) {
        if(/\n/.test(text)) {
          text = t + text.replace(/\n/g, '\n' + t + "\t")
        } else text = t + text
      }
    }
    text += '\n\n'
  } else if (!isEmpty(item.topic)) {
    text += '\n=========================\n\n'
  } else {
    text += '\n\n'
  }
  // replace all img link
  text = text.replace(
    /!\[([^\]]*?)\]\((data\/[^\s]+?)\)/g,
    (match, p1, p2) => {
      return `![${p1}](${location.origin + '/v2/' + p2})`
    }
  )
  if (!isEmpty(item.quote)) {
    text += `${t}\`${item.quote}\`\n`
  }
  if (!isEmpty(list)) {
    for (const sub of list) {
      const sText = itemToMarkdown(sub, level + 1, options)
      if (sText.trim().length > 0) {
        text += sText
      }
    }
  }
  return text
}

export function itemToJson(item: UnitPersist) {
  checkItem(item)

  const newItem: any = {
    string: !isEmpty(item.leaves) ? Item.headString(item) : item.ori,
    'create-time': item.created * 1000,
    'edit-time': item.updated * 1000,
    uid: item.ky,
    'edit-email': '',
  }
  if (!isEmpty(item.topic)) {
    newItem.topic = item.topic
  }
  if (!isEmpty(item.subitems)) {
    newItem.children = (item.subitems as UnitPersist[]).map(itemToJson)
  }
  return newItem
}

const toOpml = (item: UnitPersist, level = 1) => {
  const text = Item.headString(item)
  const children = item.subitems as UnitPersist[]
  let outline = `text="${text.replace(/>/g, '&gt;').replace(/</g, '&lt;')}"`
  // const children = plugin.memory.getChild(item.ky);
  if (!isEmpty(children)) {
    outline = `<outline ${outline}>\n`
    for (const c of children) {
      outline += toOpml(c, level + 1)
    }
    outline += `${'  '.repeat(level)}</outline>`
  } else {
    outline = `<outline ${outline} />`
  }
  return `${'  '.repeat(level) + outline}\n`
}

export function itemToOpml(item: UnitPersist) {
  checkItem(item)
  const text = Item.headString(item)
  let opmlContent = ''
  ;(item.subitems as UnitPersist[]).forEach((sub) => {
    opmlContent += toOpml(sub)
  })
  const created = dayjs(item.created).format('YYYY-MM-DD hh:mm:ss')
  const updated = dayjs(item.updated).format('YYYY-MM-DD hh:mm:ss')
  return `<?xml version="1.0" encoding="utf-8" standalone="yes"?>
<opml version="2.0">
<head>
  <title>${text}</title>
  <flavor>EvergreenNote</flavor>
  <dateCreated>${created}</dateCreated>
  <dateModified>${updated}</dateModified>
</head>
<body>
${opmlContent}</body>
</opml>`
}

function item2li(item: UnitPersist) {
  if (isEmpty(item)) {
    return ''
  }
  let html = ''
  if (Array.isArray(item.subitems)) {
    html += list2ul(item.subitems as UnitPersist[])
  }
  return `<li>${Item.headString(item)}${html}</li>`
}

function list2ul(list: UnitPersist[]) {
  let html = ''
  for (const item of list) {
    html += item2li(item)
  }
  return `<ul>${html}</ul>`
}

export function itemToHtml(data: UnitPersist, htmlTag?: 'ol' | 'ul') {
  let html = item2li(data)
  if (!isEmpty(htmlTag)) {
    html = `<${htmlTag}>${html}</${htmlTag}>`
  }
  return html
}

export async function download(
  content: string,
  filetype: string,
  filename?: string
) {
  await loadScript('js/filesaver.js')
  const { saveAs } = window as any
  filename ??= dayjs().format('YYYYMMDDhhmmss')
  return saveAs(new Blob([content]), `${filename}.${filetype}`)
}

export function compress(item: UnitPersist): Object {
  const newItem: any = {}
  for (const [k, v] of Object.entries(omitItemKeys(item))) {
    if (k === 'subitems') {
      newItem[key2k[k]] = (v as UnitPersist[]).map(compress)
    } else if (k in key2k) {
      newItem[key2k[k]] = v
    } else {
      newItem[k] = v
    }
  }
  return newItem
}

export function decompress(item: Object): UnitPersist {
  const newItem: any = {}
  for (const [k, v] of Object.entries(item)) {
    if (k in k2key) {
      newItem[(k2key as any)[k]] = v
    } else {
      newItem[k] = v
    }
  }
  return newItem as any
}
