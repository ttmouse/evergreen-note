/* eslint-disable @typescript-eslint/no-use-before-define */
/* eslint-disable @typescript-eslint/explicit-member-accessibility */
import { LoadedAddons } from '../../../main'
import { App } from '../../engine/App'
import { KyString } from '../../interfaces/unit'
import { isEmpty } from '../../utils/isEmpty'
import { recur } from '../../utils/recur'
import { Item } from '../../interfaces/item'
import { Text } from '../../slate.inc'
import { InlineElement } from '../Inlines/Inlines'
import { powerObj } from '../../utils/object/powerObj'
import {
  handleWildcard,
  parseVariable,
  unEscapeSpace,
} from './helper'
import { trimSharp } from '../Tag/helper'

export type LogicString = string

export type LogicContext = {
  app: App
  db: LoadedAddons['dbMemory']
  traits: LoadedAddons['dbMemory']
}

enum TokenType {
  LPAREN  = 'LPAREN',
  RPAREN  = 'RPAREN',
  OR      = 'OR',
  NOT     = 'NOT',
  FUNC    = 'FUNC',
  KEYWORD = 'KEYWORD',
}

interface Token {
  type: TokenType
  value: string
  funcName?: string
  funcArg?: string
}

export type Condition = string | boolean | Logic

function getLogicName(name: string) {
  return name.replace(/_*(.+)Logic$/, '$1').toLowerCase()
}

// ============================================================
// Tokenizer
// ============================================================

/** 除了 空格、括号、引号、冒号 以外都是 word 字符 */
function isWordChar(ch: string): boolean {
  return !/[\s()'":]/.test(ch)
}

/** 从 pos 位置的 '(' 开始，括号计数找到配对的 ')' */
function extractBalanced(input: string, pos: number): { content: string; end: number } {
  let depth = 1
  let i = pos + 1
  while (i < input.length && depth > 0) {
    if (input[i] === '(') depth++
    else if (input[i] === ')') depth--
    i++
  }
  if (depth !== 0) throw new Error(`Unmatched '(' at position ${pos}`)
  return { content: input.slice(pos + 1, i - 1), end: i }
}

function normalizeName(name: string): string {
  return name.toLowerCase().replace(/-/g, '')
}

function tokenize(input: string): Token[] {
  const tokens: Token[] = []
  let i = 0
  const len = input.length

  while (i < len) {
    const ch = input[i]

    // 1. 空白 → 跳过 (parser 阶段相邻非操作符 token 隐式 AND)
    if (/\s/.test(ch)) { i++; continue }

    // 2. 分组括号
    if (ch === '(') { tokens.push({ type: TokenType.LPAREN, value: '(' }); i++; continue }
    if (ch === ')') { tokens.push({ type: TokenType.RPAREN, value: ')' }); i++; continue }

    // 3. 否定前缀 -
    //    行首 或 前面是空白/(  时才是否定，否则是 word 的一部分
    if (ch === '-') {
      const prev = i > 0 ? input[i - 1] : ' '
      if (/[\s(]/.test(prev) || i === 0) {
        tokens.push({ type: TokenType.NOT, value: '-' })
        i++
        continue
      }
    }

    // 4. 引号字符串 → 关键词 (引号内空格受保护)
    if (ch === '"' || ch === "'") {
      const quote = ch
      let j = i + 1
      while (j < len && input[j] !== quote) j++
      tokens.push({ type: TokenType.KEYWORD, value: input.slice(i + 1, j) })
      i = j < len ? j + 1 : j
      continue
    }

    // 5. 单独冒号 → 跳过
    if (ch === ':') { i++; continue }

    // 6. 读取 word
    if (isWordChar(ch) || ch === '-') {
      let j = i
      while (j < len && isWordChar(input[j])) j++
      const word = input.slice(i, j)

      // 6a. word( → 函数调用，括号计数提取完整参数
      if (j < len && input[j] === '(') {
        const { content, end } = extractBalanced(input, j)
        tokens.push({
          type: TokenType.FUNC,
          value: input.slice(i, end),
          funcName: normalizeName(word),
          funcArg: content,
        })
        i = end
        continue
      }

      // 6b. word: → 冒号简写，读到空格或 ) 或末尾为止
      if (j < len && input[j] === ':') {
        let k = j + 1
        while (k < len && input[k] !== ' ' && input[k] !== ')') k++
        tokens.push({
          type: TokenType.FUNC,
          value: input.slice(i, k),
          funcName: normalizeName(word),
          funcArg: input.slice(j + 1, k),
        })
        i = k
        continue
      }

      // 6c. 保留字
      if (word === 'OR')  { tokens.push({ type: TokenType.OR, value: 'OR' }); i = j; continue }
      if (word === 'AND') { i = j; continue } // 隐式，跳过
      if (word === 'NOT') { tokens.push({ type: TokenType.NOT, value: 'NOT' }); i = j; continue }

      // 6d. 普通关键词
      tokens.push({ type: TokenType.KEYWORD, value: word })
      i = j
      continue
    }

    // 7. 兜底
    i++
  }

  return tokens
}

// ============================================================
// Parser
//
// 语法:
//   expression := or_expr
//   or_expr    := and_expr ('OR' and_expr)*
//   and_expr   := unary (unary)*
//   unary      := ('-'|'NOT') primary | primary
//   primary    := '(' expression ')' | FUNC | KEYWORD
//
// 所有实例化通过 Logic.factory() 完成
// ============================================================
 
class LogicParser {
  private tokens: Token[]
  private pos = 0
  private logic: Logic  // 用于调用 factory()
 
  constructor(logic: Logic, tokens: Token[]) {
    this.logic = logic
    this.tokens = tokens
  }
 
  private peek(): Token | null { return this.tokens[this.pos] ?? null }
  private done(): boolean { return this.pos >= this.tokens.length }
  private consume(expected?: TokenType): Token {
    const t = this.tokens[this.pos]
    if (!t) throw new Error('Unexpected end of tokens')
    if (expected && t.type !== expected)
      throw new Error(`Expected ${expected}, got ${t.type} ("${t.value}")`)
    this.pos++
    return t
  }
 
  parse(): Logic {
    if (this.done()) return this.logic.factory(FalseLogic)
    const result = this.parseOr()
    if (!this.done()) console.warn('Unparsed tokens:', this.tokens.slice(this.pos))
    return result
  }
 
  private parseOr(): Logic {
    const children: Logic[] = [this.parseAnd()]
    while (this.peek()?.type === TokenType.OR) {
      this.consume(TokenType.OR)
      children.push(this.parseAnd())
    }
    if (children.length === 1) return children[0]
    // 通过 factory 创建，传入已解析的 Logic 实例
    return this.logic.factory(OrLogic, ...children)
  }
 
  private parseAnd(): Logic {
    const children: Logic[] = [this.parseUnary()]
    while (
      !this.done() &&
      this.peek()!.type !== TokenType.OR &&
      this.peek()!.type !== TokenType.RPAREN
    ) {
      children.push(this.parseUnary())
    }
    if (children.length === 1) return children[0]
    return this.logic.factory(AndLogic, ...children)
  }
 
  private parseUnary(): Logic {
    if (this.peek()?.type === TokenType.NOT) {
      this.consume(TokenType.NOT)
      const inner = this.parsePrimary()
      return this.logic.factory(NotLogic, inner)
    }
    return this.parsePrimary()
  }
 
  private parsePrimary(): Logic {
    const t = this.peek()
    if (!t) throw new Error('Unexpected end of input')
 
    // 分组括号
    if (t.type === TokenType.LPAREN) {
      this.consume(TokenType.LPAREN)
      const expr = this.parseOr()
      this.consume(TokenType.RPAREN)
      return expr
    }
 
    // 函数调用
    if (t.type === TokenType.FUNC) {
      this.consume()
      return this.buildFunc(t)
    }
 
    // 关键词
    if (t.type === TokenType.KEYWORD) {
      this.consume()
      return this.logic.factory(KwLogic, t.value)
    }
 
    throw new Error(`Unexpected token: ${t.type} ("${t.value}")`)
  }
 
  private buildFunc(token: Token): Logic {
    const name = token.funcName!
    const rawArg = token.funcArg!
 
    // 内置组合器: OR(a, b, c)
    if (name === 'or') {
      const args = splitTopLevel(rawArg, ',')
      const children = args.map(a => this.subParse(a.trim()))
      if (children.length === 1) return children[0]
      return this.logic.factory(OrLogic, ...children)
    }
 
    // 内置组合器: AND(a, b, c)
    if (name === 'and') {
      const args = splitTopLevel(rawArg, ',')
      const children = args.map(a => this.subParse(a.trim()))
      if (children.length === 1) return children[0]
      return this.logic.factory(AndLogic, ...children)
    }
 
    // 内置组合器: NOT(x)
    if (name === 'not') {
      return this.logic.factory(NotLogic, this.subParse(rawArg.trim()))
    }
 
    // 已注册的 / 未注册的 → 都交给 factory 处理
    // factory 会查 Logic.types，找不到就返回 FalseLogic
    return this.logic.factory(name, rawArg)
  }
 
  /** 对子字符串做完整 tokenize + parse */
  private subParse(input: string): Logic {
    const tokens = tokenize(input)
    return new LogicParser(this.logic, tokens).parse()
  }
}
 
/** 按分隔符切割，尊重括号嵌套 */
function splitTopLevel(input: string, sep: string): string[] {
  const parts: string[] = []
  let depth = 0, start = 0
  for (let i = 0; i < input.length; i++) {
    if (input[i] === '(') depth++
    else if (input[i] === ')') depth--
    else if (depth === 0 && input.startsWith(sep, i)) {
      parts.push(input.slice(start, i))
      start = i + sep.length
    }
  }
  parts.push(input.slice(start))
  return parts.filter(s => s.trim().length > 0)
}
 
// ============================================================
// Logic 基类
// ============================================================
 
export class Logic {
  static types: { [k: string]: any } = {}
 
  static register(classes: { [name: string]: typeof Logic }) {
    for (const [name, cls] of Object.entries(classes)) {
      Logic.types[getLogicName(name)] = cls
    }
  }
 
  ctx: LogicContext = {} as any
  logicStr: LogicString[] = []
  children: any[] = []
 
  constructor(ctx: LogicContext, ...cond: Condition[]) {
    this.ctx = ctx
    if (cond.length > 0) {
      this.append(...cond)
    }
  }
 
  /**
   * 工厂方法：通过类型创建 Logic 实例
   * type 可以是 Function (类引用) 或 string (注册名)
   */
  factory(type: string | Function, ...cond: any[]): Logic {
    this.logicStr = cond
    let logic: Logic
    if (typeof type === 'function') {
      logic = new (type as any)(this.ctx, ...cond)
    } else {
      type = getLogicName(type)
      if (type === 'logic') {
        logic = new Logic(this.ctx, ...cond)
      } else if (type in Logic.types) {
        logic = new Logic.types[type](this.ctx, ...cond)
      } else {
        console.warn(`Logic ${type} not found`)
        logic = new FalseLogic(this.ctx)
      }
    }
    return logic
  }
 
  setContext(ctx: LogicContext) {
    if (isEmpty(ctx)) throw new Error(`Logic.setContext: ctx is empty`)
    this.ctx = ctx
  }
 
  /**
   * 添加条件
   * 接受 Logic 实例 或 字符串 (字符串会被 parse)
   */
  append(...logics: any[]): Logic {
    for (let cond of logics) {
      if (typeof cond === 'string') {
        cond = this.parse(cond)
      }
      this.children.push(cond as any)
    }
    return this
  }
 
  /**
   * 解析检索关键词
   * 使用 tokenizer + 递归下降 parser
   */
  parse(keyword: LogicString): Logic {
    const tokens = tokenize(keyword)
    const parser = new LogicParser(this, tokens)
    return parser.parse()
  }
 
  /**
   * AND 语义：所有 children 都通过
   */
  exec(item: UnitPersist): boolean {
    if (this.children.length < 1) return false
    for (const cond of this.children) {
      if (typeof cond === 'object' && typeof cond.exec === 'function') {
        if (!cond.exec(item)) return false
      } else if (cond === false) {
        return false
      } else {
        console.error('未定义的匹配条件', cond)
        return false
      }
    }
    return true
  }
 
  test(item: UnitPersist): boolean {
    return this.exec(item)
  }
 
  reset(): Logic {
    this.children = []
    return this
  }
}

export class FalseLogic extends Logic {
  exec() {
    return false
  }
}

export class TrueLogic extends Logic {
  exec() {
    return true
  }
}

/**
 * 且
 */
export class AndLogic extends Logic {
  // label = "且";
  // help = "同时满足以下条件";

  exec(item: UnitPersist): boolean {
    return super.exec(item)
  }
}

/**
 * 或
 */
export class OrLogic extends Logic {
  // label = "或";
  // help = "只要满足以下任意一个";

  exec(item: UnitPersist) {
    for (const cond of this.children) {
      if (typeof cond === 'boolean') {
        if (cond) {
          return true
        }
      } else if (typeof cond === 'object' && typeof cond.exec === 'function') {
        if (cond.exec(item)) {
          return true
        }
      } else {
        console.error('未定义的匹配条件', cond)
      }
    }
    return false
  }
}

/**
 * 非
 */
export class NotLogic extends Logic {
  exec(item: UnitPersist) {
    return !super.exec(item)
  }
}

export class KwLogic extends Logic {
  keyword!: string

  append(...logics: LogicString[] | Logic[]): Logic {
    for (let cond of logics) {
      if (typeof cond === 'string') {
        const maps = {
          '<': LtLogic,
          '<=': LteLogic,
          '=': EqLogic,
          '>': GtLogic,
          '>=': GteLogic,
          '!=': NeqLogic,
          '~=': LikeLogic,
        } as any
        const p = `(\\w+|\\w+\\.\\w+)(${Object.keys(maps).join(
          '|'
        )})(\\w+|\\w+\\.\\w+)`
        const match = new RegExp(p).exec(cond)
        if (match) {
          // cond = new maps[match[2]](`${match[1]},${match[3]}`);
          cond = this.factory(maps[match[2]], `${match[1]},${match[3]}`)
        } else {
          this.keyword = cond
          cond = cond.replace(/^("|')(.+?)\1$/g, '$2')
          cond = new RegExp(handleWildcard(cond), 'is') as any
        }
      }

      this.children.push(cond as any)
    }
    return this
  }

  exec(item: UnitPersist) {
    for (const cond of this.children) {
      if (cond instanceof RegExp) {
        const str = Item.headString(item) + Item.quoteString(item)
        if (!cond.test(str)) {
          return false
        }
      } else if (!cond.exec(item)) {
        return false
      }
    }
    return true
  }
}

export class CompareLogic extends Logic {
  left!: any
  right!: any

  append(...logics: any[]): Logic {
    const cond = logics[0] as LogicString
    // eslint-disable-next-line prefer-const
    let [left, right] = cond.split(/,\s*/)
    if (isEmpty(left)) {
      left = 'ori'
    }
    if (cond.includes('item.') === false) {
      left = `item.${left}`
    }
    this.left = parseVariable(left.trim())
    this.right = parseVariable(right.trim())
    this.children = [this.left, this.right]
    return this
  }
}

/**
 * 类似于 SQL 查询的 LIKE 运算
 */
export class LikeLogic extends CompareLogic {
  append(...logics: any[]): Logic {
    const cond = logics[0] as LogicString
    // eslint-disable-next-line prefer-const
    let [left, right] = cond.split(/,\s*/)
    this.left = parseVariable(left.trim())
    if (/\*|%/.test(right) === false) {
      right = `^${right}$`
    }
    this.right = new RegExp(handleWildcard(right.replace(/%/g, '*')), 'is')
    this.children = [this.left, this.right]
    return this
  }

  exec(item: UnitPersist) {
    const [left, right] = this.children
    return right?.test(left(item))
  }
}

/**
 * 小于 <
 */
export class LtLogic extends CompareLogic {
  exec(item: UnitPersist): boolean {
    const [left, right] = this.children
    return String(left(item)) < String(right(item))
  }
}

/**
 * 小于或等于 <=
 */
export class LteLogic extends CompareLogic {
  exec(item: UnitPersist): boolean {
    const [left, right] = this.children
    return String(left(item)) <= String(right(item))
  }
}

/**
 * 大于 >
 */
export class GtLogic extends CompareLogic {
  exec(item: UnitPersist): boolean {
    const [left, right] = this.children
    return String(left(item)) > String(right(item))
  }
}

/**
 * 大于或等于 >=
 */
export class GteLogic extends CompareLogic {
  exec(item: UnitPersist): boolean {
    const [left, right] = this.children
    return left(item) >= right(item)
  }
}

/**
 * 等于 =
 */
export class EqLogic extends CompareLogic {
  exec(item: UnitPersist): boolean {
    const [left, right] = this.children
    return (
      String(left(item)).toLowerCase().trim() ===
      String(right(item)).toLowerCase().trim()
    )
  }
}

/**
 * 不等于 !=
 */
export class NeqLogic extends CompareLogic {
  exec(item: UnitPersist): boolean {
    const [left, right] = this.children
    return (
      String(left(item)).toLowerCase().trim() !==
      String(right(item)).toLowerCase().trim()
    )
  }
}

/**
 * 介乎于某区间
 * between(1, 10) 相当于 1 < x < 10
 * between([1, 10]) 相当于 1 <= x <= 10
 * between(1, 10]) 相当于 1 < x <= 10
 * between([1, 10) 相当于 1 <= x < 10
 */
export class BetweenLogic extends Logic {
  append(...logics: any[]): Logic {
    const cond = logics[0] as LogicString

    let [left, right] = cond.split(',')

    if (left.startsWith('[')) {
      left = left.replace(/^\[/, '')
      this.children[0] = this.factory(GteLogic, left)
    } else {
      this.children[0] = this.factory(GtLogic, left.replace(/^\(/, ''))
    }

    if (right.endsWith(']')) {
      right = right.replace(/\]$/, '')
      this.children[1] = this.factory(LteLogic, right)
    } else {
      this.children[1] = this.factory(LtLogic, right.replace(/\)$/, ''))
    }
    return this
  }
}

export class FuncLogic extends Logic {
  append(...logics: any[]): Logic {
    this.children.push(this.factory(Logic, ...logics) as any)
    return this
  }
}

/**
 * 正则表达式
 */
export class RegLogic extends FuncLogic {
  append(...logics: any[]): Logic {
    const cond = logics[0] as LogicString
    this.children.push(new RegExp(cond, 'is'))
    return this
  }

  exec(item: UnitPersist) {
    const cond = this.children[0]
    return cond.test(Item.headString(item) || '')
  }
}

/**
 * 以某个字符为开头
 */
export class StartLogic extends FuncLogic {
  append(...logics: any[]): Logic {
    const cond = logics[0] as LogicString
    if (typeof cond === 'string') {
      const asterisk = handleWildcard(cond)
      this.children.push(new RegExp(`^${asterisk}`, 'is'))
    } else if ((cond as any) instanceof RegLogic) {
      this.children.push(cond)
    } else {
      console.error('EndLogic.append() 的参数不支持此变量类型: ', typeof cond)
    }

    return this
  }

  exec(item: UnitPersist) {
    return this.children[0].test(Item.headString(item) || '')
  }
}

/**
 * 以某些字符为结尾
 */
export class EndLogic extends FuncLogic {
  append(...logics: any[]): Logic {
    const cond = logics[0] as LogicString
    if (typeof cond === 'string') {
      const asterisk = handleWildcard(cond)
      this.children.push(new RegExp(`${asterisk}$`, 'is'))
    } else {
      console.error('EndLogic.append() 的参数不支持此变量类型: ', typeof cond)
    }

    return this
  }

  exec(item: UnitPersist) {
    return this.children[0].test(Item.headString(item) || '')
  }
}

export class AttrLogic extends FuncLogic {
  targetKey: string
  targetValue: string
  valLogic: Logic

  constructor(ctx: LogicContext, ...cond: string[]) {
    super(ctx, ...cond)
    ;[this.targetKey, this.targetValue] = cond[0].split(/,\s*/)
    this.valLogic = new Logic(ctx, this.targetValue)
  }

  exec(item: UnitPersist) {
    const myValue = powerObj.get(item, this.targetKey)
    return this.valLogic.exec({ ori: myValue } as any)
  }
}

/**
 * 检查直接上级节点是否符合条件
 */
export class ParentLogic extends FuncLogic {
  exec(item: UnitPersist) {
    if (!item.pky) {
      return false
    }
    const parentItem = this.ctx.db.getItem(item.pky)
    if (!parentItem || Object.keys(parentItem).length < 1) {
      return false
    }
    return (this.children[0] as Logic).exec(parentItem)
  }
}

/**
 * 检查所有的上级节点是否存在符合条件的节点
 */
export class UnderLogic extends FuncLogic {
  exec(item: UnitPersist): boolean {
    const crumbs = this.ctx.app.addons.crumbs.getCrumbs(item);
    if (!Array.isArray(crumbs)) {
      return false
    }

    for (const crumb of crumbs) {
      if (!crumb) {
        continue
      } else if (crumb.ky) {
        const parentItem = this.ctx.db.getItem(crumb.ky)
        if (parentItem && (this.children[0] as Logic).exec(parentItem)) {
          return true
        }
      }
    }
    return false
  }
}

/**
 * 检查所有的下级节点、以及自身是否存在符合条件的节点
 */
export const ITEM_HAS: { [ky: KyString]: UnitPersist } = {}
export class HasLogic extends FuncLogic {
  exec(item: UnitPersist): boolean {
    const logic = this.children[0] as Logic
    if (logic.test(item)) {
      return true
    }
    const descendant = Object.values(this.ctx.db.indexed.path[item.ky] ?? {})
    if (descendant.length > 0) {
      const foundItem = descendant.find((child) => logic.test(child))
      if (foundItem) {
        ITEM_HAS[item.ky] = foundItem
        setTimeout(() => delete ITEM_HAS[item.ky], 3000)
      }
      return Boolean(foundItem)
    }
    return false
  }
}

/**
 * 检查直接下级节点是否存在符合条件的节点
 */
export class OwnLogic extends FuncLogic {
  exec(item: UnitPersist): boolean {
    const logic = this.children[0] as Logic
    const subitems = Object.values(this.ctx.db.indexed.pky[item.ky] ?? {})
    if (subitems.length > 0) {
      return subitems.some((child) => logic.test(child))
    }
    return false
  }
}

/**
 * 是否有引用了某些笔记
 */
export class ReferLogic extends FuncLogic {
  exec(item: UnitPersist): boolean {
    const referList = [...(item.referText ?? []), ...(item.referBlock ?? [])]
    if (referList.length > 0) {
      const logic = this.children[0] as Logic
      return referList.some((ky: KyString) => {
        const refItem = this.ctx.db.getItem(ky)
        return refItem && logic.exec(refItem)
      })
    }
    return false
  }
}

/**
 * 是否被某些笔记引用
 */
export class RefbyLogic extends FuncLogic {
  exec(item: UnitPersist): boolean {
    const { db } = this.ctx
    const logic = this.children[0] as Logic
    if (
      item.topic &&
      item.topic.length > 0 &&
      !isEmpty(db.indexed.mentions[item.topic])
    ) {
      for (const one of Object.values(db.indexed.mentions[item.topic])) {
        if (logic.test(one)) {
          return true
        }
      }
    }
    if (!isEmpty(db.indexed.referText[item.ky])) {
      for (const one of Object.values(db.indexed.referText[item.ky])) {
        if (logic.test(one)) {
          return true
        }
      }
    }
    if (!isEmpty(db.indexed.referBlock[item.ky])) {
      for (const one of Object.values(db.indexed.referBlock[item.ky])) {
        if (logic.test(one)) {
          return true
        }
      }
    }
    return false
  }
}

export class KyLogic extends FuncLogic {
  exec(item: UnitPersist): boolean {
    return this.logicStr[0] === item.ky
  }
}

export class PkyLogic extends FuncLogic {
  exec(item: UnitPersist): boolean {
    return this.children[0].test({ ori: item.pky })
  }
}

export class FlatLogic extends FuncLogic {
  orLogic: Logic
  andLogic: Logic

  constructor(ctx: LogicContext, ...cond: any[]) {
    super(ctx, ...cond)
    const c = cond[0].split(/,\s*/)
    this.orLogic = this.factory(OrLogic, ...c)
    this.andLogic = this.factory(AndLogic, ...c)
  }

  exec(item: UnitPersist): boolean {
    if (this.orLogic.test(item)) {
      const tree = this.ctx.db.getSubitems(item.ky, {
        isRecur: true,
      })
      let content = Item.headString(item)
      recur(tree as any, (sub) => {
        content = `${content} ${sub.ori}`
      })
      return this.andLogic.test({ ori: content } as UnitPersist)
    }
    return false
  }
}

export class IndexLogic extends FuncLogic {
  list: { [ky: KyString]: UnitPersist } = {}

  constructor(ctx: LogicContext, ...cond: any[]) {
    super(ctx, ...cond)
    const [kw, depth = 2] = cond[0].split(/,\s*/)
    const indexItems = this.ctx.app.addons.search.findAll(kw)
    for (const item of indexItems) {
      const crawlItems = this.ctx.db.crawl(item, Number(depth))
      Object.assign(this.list, crawlItems)
    }
  }

  exec(item: UnitPersist): boolean {
    return item.ky in this.list
  }
}

export class JsLogic extends FuncLogic {
  fn: Function

  constructor(ctx: LogicContext, ...cond: any[]) {
    super(ctx, ...cond)
    // eslint-disable-next-line no-new-func
    this.fn = new Function('item', `try {return ${cond[0]}}catch(e){console.warn("User Logic Fails", e);return false;}`)
  }

  exec(item: UnitPersist): boolean {
    return this.fn(item)
  }
}

/**
 * 按下级节点数匹配
 */
export class SubCount extends FuncLogic {
  fn: (item: UnitPersist) => boolean

  constructor(ctx: LogicContext, ...cond: any[]) {
    super(ctx, ...cond)
    if (cond[0].includes(',')) {
      let [left, right] = cond[0].split(/,\s*/)
      if (!left || left.length < 1) {
        left = 0
      }
      if (!right || right.length < 1) {
        right = Infinity
      }
      this.fn = (item) => {
        const count = this.getSubCount(item)
        return count >= Number(left) && count <= Number(right)
      }
    } else {
      const c = Number(cond[0])
      this.fn = (item) => this.getSubCount(item) === c
    }
  }

  getSubCount(item: UnitPersist) {
    return Object.values(this.ctx.db.indexed.pky[item.ky] || {}).length
  }

  exec(item: UnitPersist): boolean {
    return this.fn(item)
  }
}

/**
 * 按字数匹配
 */
export class LenLogic extends FuncLogic {
  fn: (item: UnitPersist) => boolean

  constructor(ctx: LogicContext, ...cond: any[]) {
    super(ctx, ...cond)
    if (cond[0].includes(',')) {
      let [left, right] = cond[0].split(/,\s*/)
      if (!left || left.length < 1) {
        left = 0
      }
      if (!right || right.length < 1) {
        right = Infinity
      }
      this.fn = (item) => {
        const len = Item.headString(item).length
        return len >= Number(left) && len <= Number(right)
      }
    } else {
      const c = Number(cond[0])
      this.fn = (item) => Item.headString(item).length === c
    }
  }

  exec(item: UnitPersist): boolean {
    return this.fn(item)
  }
}

export class EveryNextLogic extends FuncLogic {
  exec(item: UnitPersist): boolean {
    if (typeof item.pky !== 'string' || item.pky.length < 2) {
      return false
    }
    const subitems = Object.values(this.ctx.db.indexed.pky[item.pky])
    if (subitems.length < 2) {
      return false
    }
    const w = Number(item.weight)
    let result = false
    for (const sub of subitems) {
      if (Number(sub.weight) <= w) {
        continue
      }
      if (!this.children[0].test(sub)) {
        return false
      }
      result = true
    }
    return result
  }
}

export class EveryPrevLogic extends FuncLogic {
  exec(item: UnitPersist): boolean {
    if (typeof item.pky !== 'string' || item.pky.length < 2) {
      return false
    }
    const subitems = Object.values(this.ctx.db.indexed.pky[item.pky])
    if (subitems.length < 2) {
      return false
    }
    const w = Number(item.weight)
    let result = false
    for (const sub of subitems) {
      if (Number(sub.weight) >= w) {
        continue
      }
      if (!this.children[0].test(sub)) {
        return false
      }
      result = true
    }
    return result
  }
}

type ItemScope = 'sub' | 'descendant' | 'next' | 'prev' | 'parent' | 'siblings'

export class EveryLogic extends FuncLogic {
  itemType: ItemScope = 'sub'
  rule: Logic

  constructor(ctx: LogicContext, ...cond: any[]) {
    super(ctx, ...cond)
    const [itemType, c] = cond[0].split(',')
    this.itemType = itemType as ItemScope
    this.rule = this.factory(Logic, c)
  }

  scope: {
    [k in ItemScope]?: (item: UnitPersist, ctx: LogicContext) => UnitPersist[]
  } = {
    sub(item, ctx) {
      return Object.values(ctx.db.indexed.pky[item.ky] ?? {}) as UnitPersist[]
    },
    descendant(item, ctx) {
      return Object.values(ctx.db.indexed.path[item.ky] ?? {}) as UnitPersist[]
    },
  }

  exec(item: UnitPersist): boolean {
    const items = this.scope[this.itemType]?.(item, this.ctx)
    return Boolean(items?.every((one) => this.rule.exec(one)))
  }
}

export class SomeLogic extends EveryLogic {
  exec(item: UnitPersist): boolean {
    const items = this.scope[this.itemType]?.(item, this.ctx)
    return Boolean(items?.some((one) => this.rule.exec(one)))
  }
}

export class EveryChildLogic extends FuncLogic {
  exec(item: UnitPersist): boolean {
    const subitems = Object.values(this.ctx.db.indexed.pky[item.ky] ?? {})
    if (subitems.length < 1) {
      return false
    }
    return subitems.every((one) => this.children[0].test(one))
  }
}

export class SiblingsLogic extends FuncLogic {
  exec(item: UnitPersist): boolean {
    if (typeof item.pky !== 'string' || item.pky.length < 2) {
      return false
    }
    const siblings = Object.values(this.ctx.db.indexed.pky[item.pky])
    return siblings.some((one) => this.children[0].test(one))
  }
}

export class LinkLogic extends FuncLogic {
  reg: RegExp

  constructor(ctx: LogicContext, ...cond: any[]) {
    super(ctx, ...cond)
    this.reg = new RegExp(handleWildcard(cond[0]), 'i')
  }

  exec(item: UnitPersist): boolean {
    return Boolean(item?.mentions?.some((m) => this.reg.test(m)))
  }
}

export class UnlinkLogic extends FuncLogic {
  word: string
  reg: RegExp
  linkLogic: Logic

  constructor(ctx: LogicContext, ...cond: any[]) {
    super(ctx, ...cond)
    this.word = cond[0].toLowerCase()
    this.reg = new RegExp(handleWildcard(cond[0]), 'i')
    this.linkLogic = this.factory(LinkLogic, this.word)
  }

  exec(item: UnitPersist): boolean {
    return (
      !item.topic &&
      !this.linkLogic.exec(item) &&
      this.reg.test(Item.headString(item) ?? '')
    )
  }
}

export class CompLogic extends FuncLogic {
  val: any
  blockType: string
  blockName: string

  constructor(ctx: LogicContext, ...cond: any[]) {
    super(ctx, ...cond)
    ;[this.val, this.blockType, this.blockName] = cond
    if (this.val === 'true') {
      this.val = true
    }
  }

  exec(item: UnitPersist) {
    return (
      Array.isArray(item.leaves) &&
      item.leaves.some(
        (leaf) =>
          (!this.blockType || (leaf as any).blockType === this.blockType) &&
          (leaf as any).value === this.val
      )
    )
  }
}

export class MarkLogic extends FuncLogic {
  markType: string
  markValue: any
  markTypeLogic: Logic
  markValueLogic: Logic

  constructor(ctx: LogicContext, ...cond: any[]) {
    super(ctx, ...cond)
    ;[this.markType, this.markValue] = cond[0].split(',')
    if (this.markValue === 'true') {
      this.markValue = true
    }
    this.markTypeLogic = new Logic(this.ctx, this.markType)
    this.markValueLogic = new Logic(this.ctx, this.markValue)
  }

  exec(item: UnitPersist) {
    if (!Array.isArray(item.leaves)) {
      return false
    }

    for (const leaf of item.leaves) {
      // if (this.markType in leaf === false) {
      //   continue;
      // }
      let flag = false
      if (Text.isText(leaf)) {
        for (const k of Object.keys(leaf)) {
          if (
            k !== 'text' &&
            this.markTypeLogic.exec({ ori: k } as UnitPersist)
          ) {
            flag = true
            break
          }
        }
      }
      if (!flag) {
        continue
      }
      if (
        typeof this.markValue === 'undefined' ||
        this.markValue === (leaf as any)[this.markType]
      ) {
        return true
      }
      if (typeof (leaf as any)[this.markType] === 'string') {
        return this.markValueLogic.exec({
          ori: (leaf as any)[this.markType],
        } as UnitPersist)
      }
    }
    return false
  }
}

/**
 * 通过笔记组件来检索笔记
 * element(rating, 4, value)
 * element(codeblock, javascript, mode)
 */
export class WithLogic extends FuncLogic {
  typeLogic: Logic
  valLogic!: Logic

  constructor(ctx: LogicContext, ...cond: string[]) {
    super(ctx, ...cond)
    const [type, valLogic] = cond[0].split(/,\s*/)
    this.typeLogic = new Logic(ctx, type)
    if (!isEmpty(valLogic)) {
      this.valLogic = new Logic(ctx, valLogic)
    }
  }

  toItem(el: InlineElement) {
    return {
      ...el,
      ori: String(this.ctx.app.addons.elementRegistry.getValue(el)),
    } as any as UnitPersist
  }

  exec(item: UnitPersist) {
    if (Array.isArray(item?.leaves)) {
      return item.leaves.some((leaf) => {
        // const result = [
        //   this.typeLogic.exec({ ori: (leaf as any).blockType } as any),
        //   !this.valLogic,
        //   this.valLogic.exec(this.toItem(leaf as any)),
        //   this.toItem(leaf as any)
        // ];
        // console.log(...result);
        return (
          this.typeLogic.exec({ ori: (leaf as any).blockType } as any) &&
          (!this.valLogic || this.valLogic.exec(this.toItem(leaf as any)))
        )
      })
    }
    return false
  }
}

/**
 * 笔记节点被哪些插件编辑过
 *
 * RoamEdit 要求每一个插件在它需要保存数据到节点的时候，
 * 须以它的插件名字作数据字段，将它的数据保存到节点上。
 *
 * demo:
 * use(addonName)
 * use(reminder) // 有 reminder 插件编辑过
 */
export class UseLogic extends FuncLogic {
  addonName: string

  constructor(ctx: LogicContext, addonName: string) {
    super(ctx, addonName)
    this.addonName = addonName
  }

  exec(item: UnitPersist) {
    return item && typeof (item as any)[this.addonName] === 'object'
  }
}

export class TopicLogic extends FuncLogic {
  topic: string

  constructor(ctx: LogicContext, topic: string) {
    super(ctx, topic)
    this.topic = unEscapeSpace(
      (topic ?? '').replace(/^["']|["']$/g, '').toLocaleLowerCase()
    )
  }

  exec(item: UnitPersist) {
    if (this.topic.length < 1) {
      return false
    }
    return item.topic === this.topic
  }
}

export class TagLogic extends FuncLogic {
  tag: string

  constructor(ctx: LogicContext, tag: string) {
    super(ctx, tag)
    this.tag = unEscapeSpace(
      (trimSharp(tag) ?? '').replace(/^["']|["']$/g, '')
    )
  }

  exec(item: UnitPersist) {
    if (this.tag.length < 1) {
      return false
    }
    const indexedTags = this.ctx.db.indexed.tags;
    if (!indexedTags || !indexedTags[this.tag]) {
      return false
    }
    return item.ky in indexedTags[this.tag]
  }
}


class FileLogic extends FuncLogic {
  fileName = ''
  searchPart = ''

  constructor(ctx: LogicContext, ...cond: any[]) {
    super(ctx, ...cond)
    this.fileName = cond[0]
    this.searchPart = this.fileName.split('/').pop() || ''
  }

  exec(item: UnitPersist): boolean {
    if (!item.leaves) return false
    for (const leaf of item.leaves) {
      if (!leaf) continue;
      const anyLeaf = leaf as any
      if (anyLeaf.blockType === 'img' && anyLeaf.src) {
        const urlPart = anyLeaf.src.split('/').pop() || ''
        if (urlPart === this.searchPart) return true
      }
      if (anyLeaf.blockType === 'attachment' && anyLeaf.path) {
        const pathPart = anyLeaf.path.split('/').pop() || ''
        if (pathPart === this.searchPart) return true
      }
    }
    return false
  }
}

Logic.register({
  and: AndLogic,
  or: OrLogic,
  not: NotLogic,
  kw: KwLogic,
  lt: LtLogic,
  lte: LteLogic,
  gt: GtLogic,
  gte: GteLogic,
  eq: EqLogic,
  between: BetweenLogic,
  reg: RegLogic,
  start: StartLogic,
  end: EndLogic,
  like: LikeLogic,
  attr: AttrLogic,
  neq: NeqLogic,
  parent: ParentLogic,
  under: UnderLogic,
  ancestor: UnderLogic,
  has: HasLogic,
  own: OwnLogic,
  ref: ReferLogic,
  refby: RefbyLogic,
  ky: KyLogic,
  pky: PkyLogic,
  flat: FlatLogic,
  index: IndexLogic,
  js: JsLogic,
  sub: SubCount,
  len: LenLogic,
  everyNext: EveryNextLogic,
  everyPrev: EveryPrevLogic,
  everyChild: EveryChildLogic,
  siblings: SiblingsLogic,
  link: LinkLogic,
  unlink: UnlinkLogic,
  every: EveryLogic,
  comp: CompLogic,
  mark: MarkLogic,
  with: WithLogic,
  use: UseLogic,
  topic: TopicLogic,
  tag: TagLogic,
  file: FileLogic
})
