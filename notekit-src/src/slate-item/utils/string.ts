export const upperCaseFirst = (str: string) => {
  return str.charAt(0).toUpperCase() + str.slice(1)
}

export const lowerCaseFirst = (str: string) => {
  return str.charAt(0).toLowerCase() + str.slice(1)
}

export const camelCase = (str: string) => {
  return str.replace(/[-_](\w)/g, (m, c) => c.toUpperCase())
}

export const kebabCase = (str: string) => {
  return str.replace(/([A-Z])/g, '-$1').toLowerCase()
}

export const snakeCase = (str: string) => {
  return str.replace(/([A-Z])/g, '_$1').toLowerCase()
}

export const titleCase = (str: string) => {
  return str.replace(/([A-Z])/g, ' $1').replace(/^./, (m) => m.toUpperCase())
}

export const opml2json = (opml: string) => {
  const parser = new DOMParser()
  const xmlDoc = parser.parseFromString(opml, 'text/xml')
  const json = xmlDoc.getElementsByTagName('body')[0].children[0].children
  const result: any = {}
  for (let i = 0; i < json.length; i++) {
    const item = json[i]
    const title = item.getElementsByTagName('title')[0].innerHTML
    const url = item.getElementsByTagName('xmlUrl')[0].innerHTML
    result[title] = url
  }
  return result
}

export const json2opml = (json: any) => {
  let opml =
    '<?xml version="1.0" encoding="UTF-8"?><opml version="2.0"><head><title>RSS</title></head><body><outline text="RSS" title="RSS" type="rss" version="RSS2.0" xmlUrl="https://www.google.com/alerts/moment/0/2629379425791825863/328878">'
  for (const key of Object.keys(json)) {
    opml += `<outline text="${key}" title="${key}" type="rss" version="RSS2.0" xmlUrl="${json[key]}"/>`
  }
  opml += '</body></opml>'
  return opml
}

export const doc2json = (doc: string) => {
  const parser = new DOMParser()
  const xmlDoc = parser.parseFromString(doc, 'text/xml')
  const json = xmlDoc.getElementsByTagName('body')[0].children[0].children
  const result: any = {}
  for (let i = 0; i < json.length; i++) {
    const item = json[i]
    const title = item.getElementsByTagName('title')[0].innerHTML
    const url = item.getElementsByTagName('url')[0].innerHTML
    result[title] = url
  }
  return result
}

/**
 * 将一个对象转换为 JSON 字符串, 并防止递归
 * @param obj
 * @param fn
 * @param space
 * @returns
 */
export function jsonStringifyNoCircular(
  obj: Object,
  fn?: any,
  space?: number
): string {
  const map = new WeakMap()
  return JSON.stringify(
    obj,
    (k, v) => {
      if (typeof v === 'object' && map.has(v)) {
        return `'{Circular Object}'`
      }
      map.set(v, true)
      return v
    },
    space
  )
}

/**
 * 统计字符串中某个字符出现的次数
 */
export function countStr(str: string, char: string) {
  let count = 0
  for (let i = 0; i < str.length; i++) {
    if (str[i] === char) {
      count++
    }
  }
  return count
}
