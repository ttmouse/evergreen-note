type TrieNodeData = { text: string; type: 'bilink' | 'refer'; payload?: any }
type TrieNode = {
  next: { [k: string]: TrieNode }
  prev: TrieNode
  text: string
  data?: TrieNodeData
  size: number
  isEnd?: boolean
  char: string
}
export type FoundResult = {
  node: TrieNode
  found: string
  index: number
} & TrieNodeData

export type AllFoundResult = {
  [kw: string]: FoundResult
}

export class Trie {
  root: TrieNode = { next: {} } as any

  insert(data: string | TrieNodeData) {
    if (typeof data === 'string') {
      data = { text: data, type: 'bilink' }
    }
    const len = data.text.length
    let current = this.root
    for (let i = 0; i < len; i += 1) {
      const char = data.text[i]
      const lower = char.toLowerCase()
      if (lower in current.next === false) {
        const item = {
          char,
          size: 0,
          next: {},
        }
        current.next[lower] = item as any
      }
      current = current.next[lower]
      // current.size ++;p

      if (i === len - 1) {
        current.isEnd = true
        current.data = data
        // current.word = node[textKey];
      }
    }
    return current
  }

  find(word: string) {
    let current = this.root
    for (let i = 0; i < word.length; i++) {
      const lower = word[i].toLowerCase()
      if (lower in current.next === false) {
        return false
      }
      current = current.next[lower]
    }
    if (current.isEnd) {
      return current
    }
    return false
  }

  findOneInSentence(sentence: string): FoundResult | false {
    let current = this.root
    let found = ''
    let index
    let result: FoundResult | false = false
    for (let i = 0; i < sentence.length; i++) {
      const char = sentence[i]
      const lower = char.toLowerCase()
      if (lower in current.next) {
        found += char
        current = current.next[lower]
        if (typeof index === 'undefined') {
          index = i
        }
        if (current.isEnd) {
          result = {
            found,
            index,
            ...current.data,
            node: current,
          } as FoundResult
        }
      } else if (found.length > 0) {
        if (result) {
          break
        }
        found = ''
        current = this.root
      }
    }
    if (result) {
      return result
    }
    return false
  }

  findAllInSentence(sentence: string) {
    const all: AllFoundResult = {}
    for (let i = 0; i < sentence.length; i += 1) {
      const result = this.findOneInSentence(sentence.slice(i))
      if (result) {
        all[result.found] = result
      } else {
        break
      }
    }
    return all
  }

  findPrefix(prefix: string) {
    let current = this.root
    const result: TrieNode[] = []
    for (let i = 0; i < prefix.length; i++) {
      const lower = prefix[i].toLowerCase()
      if (lower in current.next === false) {
        return false
      }
      current.next[lower].prev = current
      current = current.next[lower]
      result.push(current)
    }
    return result
  }

  remove(word: string) {
    const result = this.findPrefix(word)
    if (!result) {
      return
    }
    for (const item of result) {
      // item.size --;
      if (item.isEnd) {
        delete item.isEnd
        delete item.data
        // delete item.word;
      }
      if (Object.keys(item.next).length < 1) {
        delete item.prev.next[item.char.toLowerCase()]
      }
    }
  }
}
