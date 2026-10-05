import { isEmpty } from '@/slate-item/utils/isEmpty'
import { createFragment } from '../../utils/dom/createFragment'
import { removeMatchedElement } from '../../utils/dom/removeElement'
import { mkid } from '../../utils/string/mkid'

export type PasteItem = {
  ori: string
  subitems: PasteItem[]
  indent: number
}

function myindent(s: string, nextLine: string) {
  // const indent = 10
  // console.log(s, nextLine)
  // if (s.trim().length > 0 && nextLine && nextLine.startsWith('---')) {
  //   s = `# ${s.replace(/^#+/g, '')}`
  // }
  // s = s.replace(/\t/g, ' '.repeat(4))
  // let result = /^(#+) /.exec(s)
  // if (result) {
  //   return result[0].length
  // }
  // result = /^(\s+\*)/.exec(s)
  // if (result) {
  //   return result[0].length + indent
  // }
  // result = /^\*(\s+)/.exec(s)
  // if (result) {
  //   return result[0].length + indent
  // }
  // return indent
  const d = /^(\s*)(\*|\+|-|\d+\.)/.exec(s);
  if (d) {
    return d[1].length;
  }
  return 0;
}

function findMyChild(
  currentItem: PasteItem,
  lines: string[],
  ignoreEmptyLine = false
) {
  const first = lines[0]
  if (first && myindent(first, lines[1]) > currentItem.indent) {
    const item = {
      ori: first.trim().replace(/^(\*|\+|-)(\s|\t|\r)+/g, ''),
      subitems: [],
      indent: myindent(first, lines[1]),
    }
    if (ignoreEmptyLine) {
      item.ori = item.ori.replace(/^\s*(-|\*|\+|#+|[\n\r])\s*$/g, '')
    }
    lines.shift()
    findMyChild(item, lines, ignoreEmptyLine)
    if (item.ori.length > 0 || item.subitems.length > 0) {
      currentItem.subitems.push(item)
    }
    findMyChild(currentItem, lines, ignoreEmptyLine)
  }
}

/*
Say there is an article like below:

```
Copy
kdkdkdk
AAAAA: aaaaa
BBBB: bbbbb
CCCCC: ccc
aasdafasdfasdfa
```

Now we need to write a javascript function to determine
if there are continuous lines matching the regexp pattern /([^:]+)(:.+)/,
if true then replace the line with **$1**$2
*/
export function formatContinuousLines(
  input: string,
  pattern: RegExp,
  formatFunc: (...args: string[]) => string
) {
  const lines = input.split(/\n+/)
  let inContinuousBlock = false
  let currentBlockCount = 0
  let maxBlockCount = 0

  // const pattern = /([0-9a-z]{0,2}\.\s+)?([^:*]+)(:.+)/

  // Find the largest continuous block of matching lines
  lines.forEach((line) => {
    const matchesPattern = pattern.test(line)

    if (matchesPattern) {
      inContinuousBlock = true
      currentBlockCount++
      maxBlockCount = Math.max(maxBlockCount, currentBlockCount)
    } else {
      inContinuousBlock = false
      currentBlockCount = 0
    }
  })

  // If there's no more than one continuous matching line, return the input unchanged
  if (maxBlockCount <= 1) {
    return input
  }

  // Apply the formatting
  inContinuousBlock = false
  const formattedLines = lines.map((line, index) => {
    const match = pattern.exec(line)

    if (match) {
      inContinuousBlock = true
      return formatFunc(...Array.from(match))
    }
    if (inContinuousBlock && index > 0 && !match) {
      inContinuousBlock = false
      return `\n${line}`
    }
    return line
  })

  return formattedLines.join('\n')
}

export function boldContinuousLines(pureText: string) {
  return formatContinuousLines(
    pureText,
    /^(\s*[-+*]\s+|[0-9a-z]{0,2}\.\s+)?([^:*]+)(:.+)/i,
    (m, p1, p2, p3) => {
      if(/^\d+$/.test(p2)) return m;
      return `${p1 ?? ''}**${p2}**${p3}`
    }
  )
}

export function olContinuousLines(pureText: string) {
  return formatContinuousLines(
    pureText,
    /^([0-9a-z]{0,2}\.\s+)(.+)/i,
    (_, p1, p2) => {
      return `\t${p1}${p2}`
    }
  )
}

export function md2outline(pureText: string, ignoreEmptyLine = false) {
  const list: PasteItem[] = []

  // 预处理文件开头---开头的metadata
  pureText = pureText.replace(/^---((.|\n)+?)---/g, (match, p1) => {
    return p1
  })

  const blocks = {} as any
  const latexblocks = {} as any
  const tables = {} as any
  pureText = pureText.replace(/^\|?[^\n]*\|[^\n]*\|?[ \t]*\r?\n^\|?(?:\s*:?-+:?\s*\|)+(?:\s*:?-+:?\s*)?\|?[ \t]*\r?\n(?:^\|?[^\n]*\|[^\n]*\|?[ \t]*\r?\n?)*/gm, (match) => {
    const id = mkid()
    const s = `!TABLE-BLOCK-${id}!`
    tables[id] = match
    return s
  })
  pureText = pureText.replace(/<table[\s\S]*?<\/table>/gm, (match) => {
    const id = mkid()
    const s = `!TABLE-BLOCK-${id}!`
    tables[id] = match
    return s
  })
  pureText = pureText.replace(/```(.+?)```/gs, (match, p1) => {
    const id = mkid()
    const s = `!CODE-BLOCK-${id}!`
    blocks[id] = p1
    return s
  })
  pureText = pureText.replace(/(?:\\\[|$$)(.+?)(?:\\\]|$$)/gs, (match, p1) => {
    const id = mkid()
    const s = `!LATEX-BLOCK-${id}!`
    latexblocks[id] = p1
    return s
  })

  // pureText = olContinuousLines(boldContinuousLines(pureText))
  pureText = olContinuousLines(pureText)

  const lines = pureText.split(/\n+/).filter((line) => {
    return line.trim().length > 0
  })

  let w = 1
  while (lines.length > 0) {
    const line = lines.shift() as string

    if (line.replace(/^(\*|\+|-)(\s|\t|\r)+/g, '').length < 1) {
      continue
    }

    const str = line
      .replace(/^(\s|\t)+/g, '')
      .replace(/^(\*|\+|-)(\s|\t|\r)+/g, '')
      .replace(/^\s*•\s+/g, '');

    const item = {
      ori: str,
      indent: myindent(line, lines[0]),
      subitems: [],
    }
    findMyChild(item, lines, ignoreEmptyLine)
    list.push(item)
    if (item.indent > w) {
      w = item.indent
    }
  }

  // Replace the code block placeholders with the original code blocks
  const walk = (item: PasteItem) => {
    if(!isEmpty(item.ori)) item.ori = item.ori.replace(/!CODE-BLOCK-(.+?)!/gim, (match, p1) => {
      return "```"+blocks[p1]+"\n```"
    }).replace(/!LATEX-BLOCK-(.+?)!/gim, (match, p1) => {
      return `\\[${latexblocks[p1]}\\]`
    }).replace(/!TABLE-BLOCK-(.+?)!/gim, (match, p1) => {
      return "```table\n"+tables[p1]+"\n```"
    })
    if (item.subitems && item.subitems.length > 0) {
      for (const subitem of item.subitems) {
        walk(subitem)
      }
    }
  }

  const result = { subitems: list, indent: w };

  walk(result as PasteItem);

  return result
}

// Parse a html ul list to a outline
export function html2outline(html: string | HTMLElement): PasteItem[] {
  const fragment =
    typeof html === 'string'
      ? createFragment(html.replaceAll(/<ol/gim, '<ul'))
      : html
  const ulEle = fragment.querySelector('ul:not(ul ul)')
  if (!ulEle) {
    return []
  }
  const list: PasteItem[] = []
  const liEles = ulEle.querySelectorAll('li:not(li li)')
  for (const liEle of liEles) {
    const subitems = html2outline(liEle.innerHTML)
    removeMatchedElement(liEle as HTMLElement, 'ul')
    const item: PasteItem = {
      ori: (liEle as HTMLElement).innerText.trim(),
      subitems,
      indent: 0,
    }
    list.push(item)
  }
  fragment.removeChild(ulEle)
  return list
}

export function isCodeblock(str: string) {
  return (
    !str.includes('```') &&
    /\{(.|\n)+?\}/.test(str) &&
    /\{\{.+?\}\}/.test(str) === false &&
    str.split(/\n/).length > 1
  )
}
