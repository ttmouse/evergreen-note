/* eslint-disable no-restricted-syntax */
import { appendStyle } from '../utils/dom/appendStyle'
import { atom, gx, px, sty } from './atom'
import { ColorBase, colorBase, ColorDepth, ColorTuple, getColor } from './theme'

// 用于正确触发 TypeScript 类型检查
const C = (base: ColorBase, depth: ColorDepth): [ColorBase, ColorDepth] => [
  base,
  depth,
]

/**
 * 收集所有用到的颜色
 */
export const preColor = {
  primary: C(colorBase.blue, 600),
  secondary: C(colorBase.secondary, 600),
  success: C(colorBase.success, 600),
  info: C(colorBase.info, 600),
  danger: C(colorBase.danger, 600),
  warning: C(colorBase.warning, 600),

  white: C(colorBase.grey, 70),
  dark: C(colorBase.grey, 1000),

  text: C(colorBase.grey, 1000),
  border: C(colorBase.secondary, 200),
  help: C(colorBase.grey, 700),
  disabled: C(colorBase.grey, 700),
  shadow: C(colorBase.secondary, 300),
  icon: C(colorBase.secondary, 400),
} as const

const cssVariables: string[] = []
for (const key of Object.values(colorBase)) {
  for (let i = 1; i <= 10; i++) {
    cssVariables.push(
      `--cl-${key}-${i * 100}: ${getColor(key, (i * 100) as ColorDepth)}`
    )
  }
}
appendStyle(`
  :root {
    ${cssVariables.join(';\n')}
  }
`)

type DynamicColor = {
  base: ColorBase
  depth: ColorDepth
  tuple: [ColorBase, ColorDepth]
  darken: [ColorBase, ColorDepth]
  lighten: [ColorBase, ColorDepth]
  calc: [ColorBase, ColorDepth]
  toString: () => string
}

/**
 * 预配置样式
 * 在一个软件里, 存在着大量逻辑相似的样式, 按照 DRY原则(Don't Repeat Yourself),
 * 可以将这些重复出现的CSS样式抽离成一个一个CSS组件,
 * 这样即可以避免重复的样式, 减少文件的体积, 减少维护成本, 同时还能保持样式的一致性
 *
 * 它的核心思想是为未来的界面提供可定制的样式, 并且可以提供一个统一的样式管理接口
 */

export const preset = {
  size: {
    base: 4,
  },

  radius: {
    default: atom.rd(4),
    4: atom.rd(4),
    100: atom.rd(1000),
  },

  shape: {
    circle: atom.rd(1000),
    square: atom.rd(0),
    get roundedSquare() {
      return preset.radius['4']
    },
  },

  divide: atom.divide(...preColor.border),

  border: {
    get default() {
      return this.style + this.width + this.color
    },
    style: `border-style: solid;`,
    width: `border-width: ${px(1)};`,
    color: `border-color: ${getColor(preColor.border)};`,
    bottom: `border-bottom: ${px(1)} solid ${getColor(preColor.border)};`,
    right: `border-right: ${gx(1)} solid ${getColor(preColor.border)};`,
    left: `border-left: ${gx(1)} solid ${getColor(preColor.border)};`,

    get secondary() {
      return this.style + this.width + this.color
    },
  },

  shadow: {
    make(size: number) {
      return `box-shadow: 0 0 ${px(size)} ${getColor(preColor.shadow)};`
    },
    get basic() {
      return this.sm
    },
    get sm() {
      return this.make(4)
    },
    get md() {
      return this.make(8)
    },
    get se() {
      return `box-shadow: ${px(1)} ${px(1)} ${px(2)} ${getColor(
        preColor.shadow
      )};`
    },
  },

  flex: {
    default: `display: flex;`,
    get end() {
      return `${this.default}justify-content: flex-end;`
    },
    get start() {
      return `${this.default}justify-content: flex-start;`
    },
    get center() {
      return `${this.default}justify-content: center;`
    },
    get alignCenter() {
      return `${this.default}align-items: center;`
    },
    get alignStretch() {
      return `${this.default}align-items: stretch;`
    },
    get centre() {
      return this.default + this.alignCenter + this.center
    },
  },

  // 字阶和行高决定着一套字体系统的动态与秩序之美。
  // 字阶是指一系列有规律的不同尺寸的字体。行高可以理解为一个包裹在字体外面的无形的盒子。
  // 受到 5 音阶以及自然律的启发定义了 10 个不同尺寸的字体以及与之相对应的行高
  fontSize: {
    make(size: number, height: number) {
      return `font-size: ${px(size)}; line-height: ${px(height)};`
    },
    get 12() {
      return this.make(12, 20)
    },
    get 14() {
      return this.make(14, 22)
    },
    get 16() {
      return this.make(16, 24)
    },
    get 18() {
      return this.make(18, 26)
    },
    get 20() {
      return this.make(20, 28)
    },
    get 24() {
      return this.make(24, 32)
    },
    get 30() {
      return this.make(30, 38)
    },
    get 38() {
      return this.make(38, 46)
    },
    get 46() {
      return this.make(48, 54)
    },
    get 56() {
      return this.make(54, 64)
    },
    get 68() {
      return this.make(64, 76)
    },
    get h1() {
      return this['38']
    },
    get h2() {
      return this['30']
    },
    get h3() {
      return this['24']
    },
    get h4() {
      return this['20']
    },
    get p() {
      return this['16']
    },
  },

  fill: {
    make(base: ColorBase, depth: ColorDepth) {
      return atom.fill(base, depth)
    },
    get grey() {
      return this.make(colorBase.secondary, 300)
    },
    get primary() {
      return this.make(colorBase.primary, 600)
    },
    get info() {
      return this.make(colorBase.info, 600)
    },
    get warning() {
      return this.make(colorBase.warning, 600)
    },
    get danger() {
      return this.make(colorBase.danger, 600)
    },
    get success() {
      return this.make(colorBase.success, 600)
    },
  },

  link: {
    make(colorTuple: ColorTuple) {
      const [base, depth] = colorTuple
      const depth2 = (depth + 100) as ColorDepth
      return sty`
        color: ${colorTuple};
        cursor: pointer;
        transition: 0.1s all;
        word-break: break-word;

        &:hover {
          color: ${[base, depth2]};
        }
      `
    },

    get basic() {
      return this.make([colorBase.primary, 600])
    },

    get slate() {
      return this.make([colorBase.slate, 500])
    },
  },

  button: {
    make() {
      return `
        ${atom.$.p(8, 22).ml(8).mr(8).str()}
        ${preset.shape.roundedSquare}
        cursor: pointer;
        display: inline-flex;
        justify-content: center;
        align-items: center;
        transition: all 0.3s;
        line-height: 160%;
        user-select: none;
        opacity: 1;
        &:hover {
          opacity: 0.85;
        }`
    },
    get basic() {
      return `
        ${this.make()}
        color: ${getColor(colorBase.primary, 600)};
        &:hover {
          background-color: ${getColor(colorBase.primary, 100)}
        }`
    },
    get primary() {
      return this.make() + preset.fill.primary
    },
    get info() {
      return this.make() + preset.fill.info
    },
    get warning() {
      return this.make() + preset.fill.warning
    },
    get danger() {
      return this.make() + preset.fill.danger
    },
    get success() {
      return this.make() + preset.fill.success
    },
  },

  icon: {
    make() {
      return `
        border-radius: 100%;
        user-select: none;
        cursor: pointer;
        display: flex;
        justify-content: center;
        align-items: center;
        padding: ${px(4)};
        width: 100%;
        height: 100%;
        transition: all 0.5s;
        aspect-ratio: 1;
      `
    },

    get sm() {
      return `
        ${this.basic}
        width: ${px(30)};
        height: ${px(30)};
      `
    },

    get basic() {
      return `${this.make()}&:hover { ${preset.fill.grey} }`
    },
  },
} as const

for (const key in preset) {
  if (Object.prototype.hasOwnProperty.call(preset, key)) {
    const val = (preset as any)[key]
    if (
      typeof val === 'string' &&
      key !== '$' &&
      val.length > 0 &&
      /(;|\})$/.test(val.trim()) === false
    ) {
      throw new Error(`style preset '${key}' must end with ';'`)
    }
  }
}

type ColorVal = [ColorBase, ColorDepth]

/**
 * 一个 HTML 元素的样式
 */
export type ElePallete = {
  background: ColorVal
  text: ColorVal
  border: ColorVal
  shadow?: ColorVal
  outline?: ColorVal
  underline?: ColorVal
}

/**
 * 通过指定一个背景颜色来获得一个元素的配色
 * @param bgColor
 * @param depth
 * @returns
 */
export function calcElePallete(
  bgBase: ColorBase,
  depth: ColorDepth
): ElePallete {
  let textBase: ColorBase
  let textDepth: ColorDepth
  if (depth <= 500) {
    textBase = 'grey'
    textDepth = 1000
  } else {
    textBase = 'grey'
    textDepth = 100
  }

  return {
    background: [bgBase, depth],
    text: [textBase, textDepth],
    border: [bgBase, depth],
  }
}

/**
 * 一个 HTML 元素不同状态的样式
 */
export type ElePalleteStates = {
  normal: ElePallete
  focus?: ElePallete
  hover?: ElePallete
  active?: ElePallete
  disabled?: ElePallete
}

/**
 * 一个 Unit 各部件的样式
 */
export type UnitPallete = {
  icon: ElePalleteStates
  head: ElePalleteStates
  body: ElePalleteStates
  extra: ElePalleteStates
  child: ElePalleteStates
}
