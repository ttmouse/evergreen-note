/* eslint-disable @typescript-eslint/no-use-before-define */
import { css } from '@emotion/css'
import { browser } from '../utils/browser'
import { ColorBase, ColorDepth, ColorTuple, getColor } from './theme'

export type ColorVal = [ColorBase, ColorDepth]
export type CssString = string
export type CssClass = string
export type CssSize = number

export enum Breakpoints {
  xs = 576,
  sm = 768,
  md = 992,
  lg = 1200,
  xl = 1600,
}

/**
 * Parse a Javascript template literal into a CSS string.
 * @param str
 * @param vars
 * @returns
 */
export const sty = (
  arr: TemplateStringsArray | string,
  ...vars: any[]
): string => {
  if (typeof arr === 'string') {
    arr = [arr] as any
  }
  const strings = Array.from(arr)
  const result = [strings.shift()]
  for (let i = 0; i < vars.length; i++) {
    let v = typeof vars[i] === 'function' ? vars[i]() : vars[i]
    // 支持直接使用 [ColorBase, ColorDepth] 来设置颜色
    if (Array.isArray(v)) {
      v = getColor(v as ColorTuple)
    }

    result.push(v)
    result.push(strings[i])
  }
  return result.join('')
}

/**
 * Output a CSS string as css class
 * @param arr
 * @param vars
 * @returns
 */
const classes: { [k: string]: string } = {}
export function cls(
  arr: TemplateStringsArray | string,
  ...vars: any[]
): string {
  if (typeof arr === 'string') {
    arr = [arr] as any
  }
  const newVars = vars.map((v) => {
    if (typeof v === 'string') {
      if (v.startsWith('css-') && v in classes) {
        return classes[v]
      }
    }
    return v
  })
  let cssText = sty(arr as any, ...newVars)
  // 在控制文字颜色的时候, 也控制 SVG 图标的颜色

  if (browser.legacySafari) {
    cssText = cssText.replace(
      new RegExp('(^|[^-])color:\\s+([^;]+);?'),
      '$1color: $2; fill: $2; svg { fill: $2; };'
    )
  } else {
    cssText = cssText.replace(
      new RegExp('(?<!-)color:\\s+([^;]+);?'),
      'color: $1; fill: $1; svg { fill: $1; };'
    )
  }

  const c = css(cssText)
  classes[c] = cssText
  const match = /stkey:\s*([a-z-]+);?/im.exec(cssText)
  // if (match) {
  //   console.log(`${c} ${match[1]}`)
  //   return `${c} ${match[1]}`;
  // }
  return c
}

export function cla(...args: string[]) {
  const arr: string[] = []
  for (const s of args) {
    if (s.includes(':')) {
      arr.push(cls(s))
    } else {
      arr.push(s)
    }
  }
  return arr.join(' ')
}

export const atom = {
  /**
   * 媒体查询后, 针对不同屏宽设置不同的样式
   * @param breakpoint
   * @param css
   * @returns
   */
  media(breakpoint: keyof typeof Breakpoints, v: CssString) {
    return `
      @media (max-width: ${px(Breakpoints[breakpoint])}) {
        ${v}
      }`
  },

  xs(v: CssString) {
    return atom.media('xs', v)
  },

  sm(v: CssString) {
    return atom.media('sm', v)
  },

  md(v: CssString) {
    return atom.media('md', v)
  },

  lg(v: CssString) {
    return atom.media('lg', v)
  },

  xl(v: CssString) {
    return atom.media('xl', v)
  },

  mobile(v: CssString) {
    return atom.media('sm', v)
  },

  /**
   * 控制在不同屏宽下的元素是否隐藏
   * @param breakpoints
   * @returns
   */
  hidden(...breakpoints: (keyof typeof Breakpoints)[]) {
    if (breakpoints.length === 0) {
      breakpoints = ['xs', 'sm', 'md', 'lg']
    }
    return breakpoints
      .map((breakpoint) => {
        return this[breakpoint](`display: none`)
      })
      .join('\n')
  },

  l(k: string, v: any) {
    return set(`${k}-left`, v)
  },

  r(k: string, v: any) {
    return set(`${k}-right`, v)
  },

  t(k: string, v: any) {
    return set(`${k}-top`, v)
  },

  b(k: string, v: any) {
    return set(`${k}-bottom`, v)
  },

  /**
   * padding
   * @param args
   * @returns
   */
  p: (...args: CssSize[]) => box('padding', ...args),

  /**
   * padding-left、padding-right
   */
  px(v: CssSize) {
    return boxX('padding', v)
  },

  /**
   * padding-top、padding-bottom
   */
  py(v: CssSize) {
    return boxY('padding', v)
  },

  /**
   * margin
   * @param args
   * @returns
   */
  m: (...args: CssSize[]) => box('margin', ...args),

  ml(v: CssSize) {
    return set('margin-left', v)
  },

  mr(v: CssSize) {
    return set('margin-right', v)
  },

  mt(v: CssSize) {
    return set('margin-top', v)
  },

  mb(v: CssSize) {
    return set('margin-bottom', v)
  },

  mx(v: CssSize) {
    return boxX('margin', v)
  },

  my(v: CssSize) {
    return boxY('margin', v)
  },

  gutter(v: CssString) {
    return `& > * + * {${v}}`
  },

  /**
   * 控制子元素的间距
   * @param x 水平方向的间距
   * @param y 垂直方向的间距
   * @returns
   */
  space(x?: CssSize, y?: CssSize) {
    let v = ''
    if (x) {
      v += this.ml(x / 2) + this.mr(x / 2)
    }
    if (y) {
      v += this.mb(y)
    }
    return atom.gutter(v)
  },

  triangleDown(extraCss = '') {
    return `
      &::after {
        content: "";
        position: absolute;
        bottom: 0;
        left: 50%;
        width: 0;
        height: 0;
        border-left: 5px solid transparent;
        border-right: 5px solid transparent;
        border-top: 10px solid;
        ${extraCss}
      }
    `
  },

  triangleLeft(extraCss = '') {
    return `
      &::before {
        content: "";
        position: absolute;
        top: 50%;
        left: 0;
        width: 0;
        height: 0;
        border-top: 5px solid transparent;
        border-bottom: 5px solid transparent;
        border-right: 10px solid;
        ${extraCss}
      }
    `
  },

  triangleRight(extraCss = '') {
    return `
      &::after {
        content: "";
        position: absolute;
        top: 50%;
        right: 0;
        width: 0;
        height: 0;
        border-top: 5px solid transparent;
        border-bottom: 5px solid transparent;
        border-left: 10px solid;
        ${extraCss}
      }
    `
  },

  /**
   * 分割线
   */
  divide(baseColor: ColorBase, depth: ColorDepth) {
    return atom.gutter(
      `border-bottom: ${px(1)} solid ${getColor(baseColor, depth)}`
    )
  },

  allW(v: number) {
    return `width: ${px(v)}; flex-basis: ${px(v)};`
  },

  allH(v: number) {
    return `height: ${px(v)}; flex-basis: ${px(v)};`
  },

  w(v: CssSize) {
    return set('width', v)
  },

  w100() {
    return set('width', '100%')
  },

  h(v: CssSize) {
    return set('height', v)
  },

  h100() {
    return set('height', '100%')
  },

  minW(v: CssSize) {
    return set('min-width', v)
  },

  minH(v: CssSize) {
    return set('min-height', v)
  },

  maxW(v: CssSize) {
    return set('max-width', v)
  },

  maxH(v: CssSize) {
    return set('max-height', v)
  },

  hover(v: CssString) {
    return `&:hover {${v}}`
  },

  /**
   * 将屏幕分成12等份, 每一份的宽度是1/12
   * @param colAmount 当前一共有多少列
   * @param breakpoint 在不同屏宽之下的宽度
   */
  col(colAmount: number, breakpoint?: keyof typeof Breakpoints) {
    const w = (1 / 12) * colAmount * 100
    const v = `
      flex: 0 0 ${w}%;
      max-width: ${w}%;
    `
    if (breakpoint) {
      return atom.media(breakpoint, v)
    }
    return v
  },

  /**
   * 默认阴影
   */
  shadow() {
    return `
      box-shadow: 0 0 ${px(4)} rgba(0, 0, 0, 0.2);
      &:hover {
        box-shadow: 0 0 ${px(4)} rgba(0, 0, 0, 0.2);
        transition: all 0.3s;
      };`
  },

  /**
   * 角弧度
   */
  rd(v: CssSize = 5) {
    return `border-radius: ${px(v)};`
  },

  /*
   * 圆形
   */
  circle() {
    return this.rd(1000)
  },

  /**
   * 显示成一行
   */
  line() {
    return `
      display: flex;
      align-items: center;
      flex-wrap: nowrap;
    `
  },

  /**
   * 整块填充颜色的区块
   */
  fill(base: ColorBase, depth: ColorDepth) {
    const textBase: ColorBase = 'grey'
    let textDepth: ColorDepth = 1000
    if (depth > 500) {
      textDepth = 100
    }

    let borderBase: ColorBase
    let borderDepth: ColorDepth
    if (depth === 900) {
      borderBase = 'grey'
      borderDepth = 1000
    } else {
      borderBase = base
      borderDepth = (depth + 100) as ColorDepth
    }

    return `
      background-color: ${getColor(base, depth)};
      color: ${getColor(textBase, textDepth)};
      border-color: ${getColor(borderBase, borderDepth)};
    `
  },

  outline(base: ColorBase, depth: ColorDepth) {
    return `
      background-color: transparent;
      border-color: ${getColor(base, depth)};
      color: ${getColor(base, depth)};
    `
  },

  bgsvg(params: { svg: string; color: string }) {
    const { svg, color } = params
    const svg2 = svg
      .replace(
        /.*<svg.*?>(.*?)<\/svg>/gim,
        '<svg viewBox="0 0 1024 1024" version="1.1" xmlns="http://www.w3.org/2000/svg">$1</svg>'
      )
      .replace(/fill=(".*?"|'.*?')/, '')
      .replace(/'/gm, '"')

    return `
      background-repeat: no-repeat;
      background-color: ${color};
      -webkit-mask-image: url('data:image/svg+xml;charset=UTF-8,${svg2}');
      mask-image: url('data:image/svg+xml;charset=UTF-8,${svg2}');
    `
  },

  /**
   * 渐变
   * @param to 渐变方向
   * @param start 起始颜色
   * @param stop 结束颜色
   * @returns
   */
  gradient(
    to: 'top' | 'right' | 'bottom' | 'left',
    start: ColorVal,
    stop: ColorVal
  ) {
    return `
      background: linear-gradient(to ${to}, ${getColor(...start)}, ${getColor(
      ...stop
    )});
      background-size: 100% 100%;
    `
  },

  /**
   * 渐变下划线
   * @returns
   */
  underlineGradient(opt = {}) {
    return `
      &::before {
        content: "";
        position: absolute;
        top: 100%;
        width: 100%;
        left: 0;
        height: 3px;
        border-radius: 2px;
        background: linear-gradient(130deg,#ff7a18,#af002d 41.07%,#319197 76.05%);
      }`
  },

  selectOff() {
    return `
      -webkit-touch-callout: none;
      -webkit-user-select: none;
      -khtml-user-select: none;
      -moz-user-select: none;
      -ms-user-select: none;
      user-select: none;
    `
  },

  /**
   * The stylesheet for text or font properties
   */
  text: {
    transform(v: 'uppercase' | 'lowercase' | 'capitalize' | 'none') {
      return `text-transform: ${v};`
    },

    upper() {
      return this.transform('uppercase')
    },

    capitalize() {
      return this.transform('capitalize')
    },

    align(v: 'left' | 'center' | 'right' | 'justify') {
      return `text-align: ${v};`
    },

    center() {
      return `text-align: center;`
    },

    right() {
      return `text-align: right;`
    },

    color(v: ColorVal) {
      return `color: ${getColor(v)};`
    },

    // decorate(v: 'underline' | 'overline' | 'line-through' | 'none') {
    //   return `text-decoration: ${v};`;
    // },

    // decorateColor(v: ColorVal) {
    //   return `text-decoration-color: ${getColor(v)};`;
    // },

    // decorateStyle(v: 'solid' | 'double' | 'dotted' | 'dashed' | 'wavy') {
    //   return `text-decoration-style: ${v};`;
    // },

    // decorateThickness(v: CssSize) {
    //   return `text-decoration-thickness: ${px(v)};`;
    // },

    underline() {
      return `text-decoration: underline;`
    },

    decorateOffset(v: CssSize) {
      return `text-underline-offset: ${px(v)};`
    },

    overflow(params: {
      method: 'clip' | 'ellipsis' | 'truncate' | 'inherit'
      maxWidth?: number | string
    }) {
      const s = {
        // Use truncate to truncate overflowing text with an ellipsis (…) if needed.
        truncate: `
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;`,

        // Use text-ellipsis to truncate overflowing text with an ellipsis (…) if needed.
        ellipsis: 'text-overflow: ellipsis',

        // Use clip to truncate the text at the limit of the content area.
        clip: 'text-overflow: clip;',
      }
      return `
        ${(s as any)[params.method]}
        display: inline !important;
        max-width: ${px(params.maxWidth ?? 'calc(100% - 40px)')};
      `
    },

    truncate(params: { maxWidth?: number | string } = {}) {
      return atom.text.overflow({
        method: 'truncate',
        ...params,
      })
    },

    // indent(v: CssSize) {
    //   return `text-indent: ${px(v)};`;
    // },

    // vertical(v: 'top' | 'middle' | 'bottom' | 'baseline' | 'text-top' | 'text-bottom' | 'sub' | 'super') {
    //   return `vertical-align: ${v};`;
    // },

    middle() {
      return `vertical-align: middle;`
    },

    // letterSpace(v: CssSize) {
    //   return `letter-spacing: ${px(v)};`;
    // },

    // whitespace(v: 'normal' | 'nowrap' | 'pre' | 'pre-line' | 'pre-wrap') {
    //   return `white-space: ${v};`;
    // },

    // wordbreak(v: 'normal' | 'break-all' | 'break-word') {
    //   return `word-break: ${v};`;
    // },

    // wordwrap(v: 'normal' | 'break-word') {
    //   return `word-wrap: ${v};`;
    // },

    // lineHeight(v: CssSize) {
    //   return `line-height: ${px(v)};`;
    // },

    // weight(v: 'normal' | 'bold' | 'bolder' | 'lighter' | '100' | '200' | '300' | '400' | '500' | '600' | '700' | '800' | '900') {
    //   return `font-weight: ${v};`;
    // },

    italic() {
      return `font-style: italic;`
    },

    bold() {
      return `font-weight: bold;`
    },
  },

  scrollbar(params: { width: number } = {} as any) {
    const { width = 8 } = params
    return `
      ::-webkit-scrollbar {
        width: ${width}px;
        height: 6px;
        background-color: transparent;
      }
      ::-webkit-scrollbar-button {
        width: 10px;
        height: 6;
        background-color: transparent;
      }
      ::-webkit-scrollbar-track{
        background-color: transparent;
      }
      /* 滚动条滑块 默认情况下的样式 */
      ::-webkit-scrollbar-thumb {
        background : var(--cl-slate-200);
        -webkit-transition: .3s;
        border-radius: 4px;
        transition: .3s;
      }
      :hover::-webkit-scrollbar-thumb {
        background : var(--cl-slate-300);
      }
      /* 滚动条滑块 鼠标悬停时的样式 */
      ::-webkit-scrollbar-thumb:hover{
        background-color: var(--cl-slate-400);
      }
      /* 滚动条滑块 鼠标按下时的样式 */
      ::-webkit-scrollbar-thumb:active{
        background-color: var(--cl-slate-500);
      }`
  },

  /**
   * 创建一个代理对象, 使得 atom 能支持链式操作
   */
  get $() {
    return chainable(this)
  },

  get $text() {
    return chainable(this.text)
  },
} as const

type AtomKey = keyof typeof atom

type AtomProxy = {
  [P in AtomKey]: (...args: any) => AtomProxy
} & {
  [P in AtomKey]: AtomProxy
} & {
  str: () => CssString
  css: (v: CssString) => AtomProxy
  class: () => CssClass
}

/**
 * 创建一个代理对象, 使得 atom 能支持链式操作
 * 示例: atom.$.space(8).fill('#eee').circle.css
 * 注意: 最后需要调用 .css 属性来获取样式
 * @returns
 */
export function chainable(obj: any): AtomProxy {
  const cssString: string[] = []
  const proxy: AtomProxy = new Proxy(
    {},
    {
      get(target: any, key: AtomKey) {
        if ((key as any) === 'css') {
          return (v = '') => {
            cssString.push(v)
            return proxy
          }
        }
        if ((key as any) === 'class') {
          return (v = '') => sty`${cssString.join(' ')}`
        }

        if ((key as any) === 'str') {
          return () => cssString.join(' ')
        }

        if (typeof obj[key] === 'function') {
          return (...args: any) => {
            cssString.push((obj as any)[key](...args) ?? '')
            return proxy
          }
        }
        if (typeof obj[key] === 'string') {
          // 如果 atom 没有定义, 则直接输出 Css 的属性与值
          cssString.push((obj as any)[key] ?? '')
          return proxy
        }
        return (v: any) => {
          cssString.push(`${key}: ${v};`)
          return proxy
        }
      },
    }
  ) as any
  return proxy
}

function set(k: string, v: any) {
  if (typeof v === 'number') {
    v = px(v)
  }
  return `${k}: ${v};`
}

const box = (key: string, ...args: CssSize[]) => {
  const [t, r, b, l] = args
  if (args.length === 4) {
    return `${key}: ${px(t)} ${px(r)} ${px(b)} ${px(l)};`
  }
  if (args.length === 3) {
    return `${key}: ${px(t)} ${px(r)} ${px(b)}px ${px(r)};`
  }
  if (args.length === 2) {
    return `${key}: ${px(t)} ${px(r)} ${px(t)} ${px(r)};`
  }
  return `${key}: ${px(t)};`
}

const boxX = (key: string, v: CssSize) => {
  return `${key}-left: ${px(v)}; ${key}-right: ${px(v)};`
}

const boxY = (key: string, v: CssSize) => {
  return `${key}-top: ${px(v)}; ${key}-bottom: ${px(v)};`
}

export const px = (v: CssSize | string) => {
  if (typeof v === 'string') {
    return v
  }
  return `${v}px`
}
export const gx = (v: number) => `${v * 4}px`
