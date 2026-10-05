// mark-highlight-extensions.ts

import type {
  Extension,
  TokenizeContext,
  Tokenizer,
  State,
  Effects,
  Code,
  HtmlExtension,
  Token,
  CompileContext
} from 'micromark-util-types'

// 扩展自定义 token 类型
declare module 'micromark-util-types' {
  interface TokenTypeMap {
    markHighlight: 'markHighlight'
    markHighlightMarker: 'markHighlightMarker'
  }
}

// 语法扩展
export const highlightSyntax: Extension = {
  text: {
    [61]: { // '=' 字符的 charCode
      tokenize: tokenizeHighlight,
      partial: true
    }
  }
}

// HTML 扩展
export const highlightHTML: HtmlExtension = {
  enter: {
    markHighlight: enterHighlight
  },
  exit: {
    markHighlight: exitHighlight
  }
}

function tokenizeHighlight(
  this: TokenizeContext,
  effects: Effects,
  ok: State,
  nok: State
): State {
  const self = this
  let markerCount = 0
  let closeCount = 0

  return start

  function start(code: Code): State | undefined {
    if (code !== 61) return nok(code) // 不是 '=' 字符
    effects.enter('markHighlight')
    effects.enter('markHighlightMarker')
    return open(code)
  }

  function open(code: Code): State | undefined {
    if (code === 61 && markerCount < 2) {
      effects.consume(code)
      markerCount++
      return open
    }
    
    if (markerCount === 2) {
      effects.exit('markHighlightMarker')
      return content(code)
    }
    
    return nok(code)
  }

  function content(code: Code): State | undefined {
    if (code === null) return nok(code)
    
    if (code === 61) {
      effects.enter('markHighlightMarker')
      closeCount = 0
      return close(code)
    }
    
    effects.enter('chunkString', { contentType: 'string' })
    return contentContinue(code)
  }

  function contentContinue(code: Code): State | undefined {
    if (code === null || code === 61) {
      effects.exit('chunkString')
      return content(code)
    }
    
    effects.consume(code)
    return contentContinue
  }

  function close(code: Code): State | undefined {
    if (code === 61 && closeCount < 2) {
      effects.consume(code)
      closeCount++
      return close
    }
    
    if (closeCount === 2) {
      effects.exit('markHighlightMarker')
      effects.exit('markHighlight')
      return ok(code)
    }
    
    return nok(code)
  }
}

function enterHighlight(this: CompileContext, token: Token): undefined {
  this.tag('<span class="mark-highlight">')
  return undefined
}

function exitHighlight(this: CompileContext, token: Token): undefined {
  this.tag('</span>')
  return undefined
}
