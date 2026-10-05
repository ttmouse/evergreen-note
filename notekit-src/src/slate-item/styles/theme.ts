export type ColorBase =
  | 'grey'
  | 'slate'
  | 'red'
  | 'volcano'
  | 'orange'
  | 'blue'
  | 'gold'
  | 'sunrise'
  | 'lime'
  | 'green'
  | 'cyan'
  | 'geekblue'
  | 'purple'
  | 'magenta'
export type ColorTitle =
  | '黑白'
  | '高级灰'
  | '薄暮红'
  | '火山红'
  | '日暮橙'
  | '科技蓝'
  | '金黄'
  | '日出黄'
  | '青柠'
  | '极光绿'
  | '明青'
  | '极客蓝'
  | '酱紫'
  | '粉红'
export type ColorDepth =
  | 0
  | 70
  | 80
  | 90
  | 100
  | 200
  | 300
  | 400
  | 500
  | 600
  | 700
  | 800
  | 900
  | 1000
export type ColorTuple = [ColorBase, ColorDepth, string?]
export type ColorDef = ColorTuple
type ColorValue = string // 最终的 RGB 颜色值

// Create an enum with the values from tye ColorBase
export enum colorBase {
  grey = 'grey',
  slate = 'slate',
  red = 'red',
  volcano = 'volcano',
  orange = 'orange',
  blue = 'blue',
  gold = 'gold',
  sunrise = 'sunrise',
  lime = 'lime',
  green = 'green',
  cyan = 'cyan',
  geekblue = 'geekblue',
  purple = 'purple',
  magenta = 'magenta',

  primary = 'blue',
  secondary = 'slate',
  success = 'green',
  info = 'cyan',
  danger = 'volcano',
  warning = 'orange',
}

type ColorCollection = {
  [key in ColorBase]: {
    title: ColorTitle
    body: {
      [k in ColorDepth]: ColorValue
    }
  }
}

/**
 * 预定义颜色
 */
export const colorCollection: ColorCollection = {
  grey: {
    title: '黑白',
    body: {
      0: 'transparent',
      70: '#ffffff',
      80: '#fafafa',
      90: '#f5f5f5',
      100: '#f0f0f0',
      200: '#d9d9d9',
      300: '#bfbfbf',
      400: '#8c8c8c',
      500: '#595959',
      600: '#434343',
      700: '#262626',
      800: '#1f1f1f',
      900: '#141414',
      1000: '#000000',
    },
  },
  slate: {
    title: '高级灰',
    body: {
      0: '',
      70: '',
      80: '',
      90: '',
      // 50: "#f8fafc",
      100: '#f1f5f9',
      200: '#e2e8f0',
      300: '#cbd5e1',
      400: '#94a3b8',
      500: '#64748b',
      600: '#475569',
      700: '#334155',
      800: '#1e293b',
      900: '#0f172a',
      1000: '',
    },
  },
  red: {
    title: '薄暮红',
    body: {
      0: '',
      70: '',
      80: '',
      90: '',
      100: '#fff1f0',
      200: '#ffccc7',
      300: '#ffa39e',
      400: '#ff7875',
      500: '#ff4d4f',
      600: '#f5222d',
      700: '#cf1322',
      800: '#a8071a',
      900: '#820014',
      1000: '#5c0011',
    },
  },
  volcano: {
    title: '火山红',
    body: {
      0: '',
      70: '',
      80: '',
      90: '',
      100: '#fff2e8',
      200: '#ffd8bf',
      300: '#ffbb96',
      400: '#ff9c6e',
      500: '#ff7a45',
      600: '#fa541c',
      700: '#d4380d',
      800: '#ad2102',
      900: '#871400',
      1000: '#610b00',
    },
  },
  orange: {
    title: '日暮橙',
    body: {
      0: '',
      70: '',
      80: '',
      90: '',
      100: '#fff7e6',
      200: '#ffe7ba',
      300: '#ffd591',
      400: '#ffc069',
      500: '#ffa940',
      600: '#fa8c16',
      700: '#d46b08',
      800: '#ad4e00',
      900: '#873800',
      1000: '#612500',
    },
  },
  blue: {
    title: '科技蓝',
    body: {
      0: '',
      70: '',
      80: '',
      90: '',
      100: '#e6f7ff',
      200: '#bae7ff',
      300: '#bae7ff',
      400: '#69c0ff',
      500: '#40a9ff',
      600: '#1890ff',
      700: '#096dd9',
      800: '#0050b3',
      900: '#003a8c',
      1000: '#002766',
    },
  },
  gold: {
    title: '金黄',
    body: {
      0: '',
      70: '',
      80: '',
      90: '',
      100: '#fffbe6',
      200: '#fff1b8',
      300: '#ffe58f',
      400: '#ffd666',
      500: '#ffc53d',
      600: '#faad14',
      700: '#d48806',
      800: '#ad6800',
      900: '#8a4b00',
      1000: '#613400',
    },
  },
  sunrise: {
    title: '日出黄',
    body: {
      0: '',
      70: '',
      80: '',
      90: '',
      100: '#feffe6',
      200: '#ffffb8',
      300: '#fffb8f',
      400: '#fff566',
      500: '#ffec3d',
      600: '#fadb14',
      700: '#d4b106',
      800: '#ad8b00',
      900: '#876800',
      1000: '#614700',
    },
  },
  lime: {
    title: '青柠',
    body: {
      0: '',
      70: '',
      80: '',
      90: '',
      100: '#fcffe6',
      200: '#f4ffb8',
      300: '#eaff8f',
      400: '#d3f261',
      500: '#bae637',
      600: '#a0d911',
      700: '#7cb305',
      800: '#5b8c00',
      900: '#3f6600',
      1000: '#254000',
    },
  },
  green: {
    title: '极光绿',
    body: {
      0: '',
      70: '',
      80: '',
      90: '',
      100: '#f6ffed',
      200: '#d9f7be',
      300: '#b7eb8f',
      400: '#95de64',
      500: '#73d13d',
      600: '#52c41a',
      700: '#389e0d',
      800: '#237804',
      900: '#135200',
      1000: '#092b00',
    },
  },
  cyan: {
    title: '明青',
    body: {
      0: '',
      70: '',
      80: '',
      90: '',
      100: '#e6fffb',
      200: '#b5f5ec',
      300: '#87e8de',
      400: '#5cdbd3',
      500: '#36cfc9',
      600: '#13c2c2',
      700: '#08979c',
      800: '#006d75',
      900: '#00474f',
      1000: '#002329',
    },
  },
  geekblue: {
    title: '极客蓝',
    body: {
      0: '',
      70: '',
      80: '',
      90: '',
      100: '#f0f5ff',
      200: '#d6e4ff',
      300: '#adc6ff',
      400: '#85a5ff',
      500: '#597ef7',
      600: '#2f54eb',
      700: '#1d39c4',
      800: '#10239e',
      900: '#061178',
      1000: '#030852',
    },
  },
  purple: {
    title: '酱紫',
    body: {
      0: '',
      70: '',
      80: '',
      90: '',
      100: '#f9f0ff',
      200: '#efdbff',
      300: '#d3adf7',
      400: '#b37feb',
      500: '#9254de',
      600: '#722ed1',
      700: '#531dab',
      800: '#391085',
      900: '#22075e',
      1000: '#120338',
    },
  },
  magenta: {
    title: '粉红',
    body: {
      0: '',
      70: '',
      80: '',
      90: '',
      100: '#fff0f6',
      200: '#ffd6e7',
      300: '#ffadd2',
      400: '#ff85c0',
      500: '#f759ab',
      600: '#eb2f96',
      700: '#c41d7f',
      800: '#9e1068',
      900: '#780650',
      1000: '#520339',
    },
  },
}

type Palette = {
  [key in ColorBase]: (depth: ColorDepth) => ColorValue
}

export const colorAvail: Palette = (() => {
  const arr: Palette = {} as any
  Object.keys(colorCollection).forEach((key) => {
    arr[key as ColorBase] = (depth: ColorDepth) =>
      colorCollection[key as ColorBase].body[depth]
  })
  return arr
})() as Palette

export type ThemeOptions = {
  base: ColorBase
  bgBase: ColorBase
}

export type DefinedColors = {
  // 功能性颜色
  info: ColorDef
  primary: ColorDef
  success: ColorDef
  warning: ColorDef
  danger: ColorDef
  default: ColorDef
  white: ColorDef
  black: ColorDef

  // 文字颜色
  /**
   * 主文本色
   */
  text: ColorDef
  /**
   * 代码颜色
   */
  textCode: ColorDef
  /**
   * 高亮文本颜色
   */
  textHighlight: ColorDef
  /**
   * 链接文字颜色
   */
  textLink: ColorDef
  /**
   * 双向链接文字颜色
   */
  textBilink: ColorDef
  /**
   * 弹出层文字颜色
   */
  textModal: ColorDef

  // 边框
  border: ColorDef
  borderLinkHint: ColorDef
  borderNodeChild: ColorDef

  bg100: ColorDef
  bg200: ColorDef
  bg300: ColorDef
  bg400: ColorDef
  bg500: ColorDef
  bg600: ColorDef
  bg700: ColorDef
  bg800: ColorDef
  bg900: ColorDef
  bg1000: ColorDef

  bgIcon: ColorDef
  bgIconHover: ColorDef
  bgIconOutline: ColorDef
  bgIconOutlineHover: ColorDef

  bgNavbar: ColorDef
  bgNavbarItemHover: ColorDef
  textNavbar: ColorDef
  iconNavbar: ColorDef

  bgMenu: ColorDef
  bgMenuItemHover: ColorDef
  iconMenuItem: ColorDef
  textMenuItem: ColorDef

  iconSystem: ColorDef
}

type ResultColors = {
  [colorName in keyof DefinedColors]: ColorValue
}

type ResultTuples = {
  [colorName in keyof DefinedColors]: [ColorBase, ColorDepth]
}

export function createTheme(body: ThemeOptions): [ResultColors, ResultTuples] {
  const { base = 'blue', bgBase = 'grey' } = body

  const colors: DefinedColors = {
    // 功能性颜色
    info: [base, 800, '信息'],
    primary: [base, 600, '主色'],
    success: ['green', 700, '成功'],
    warning: ['gold', 600, '提醒'],
    danger: ['red', 500, '危险'],
    default: [bgBase, 1000, '默认'],
    white: ['grey', 100, '白色'],
    black: ['grey', 1000, '黑色'],

    // 文字颜色
    get text(): ColorDef {
      return [colors.default[0], colors.default[1], '段落文字']
    },
    textCode: [base, 200, '行内代码文字'],
    textHighlight: ['gold', 300, '高亮文字'],
    textLink: [base, 700, '链接'],
    textBilink: [base, 700, '双向链接'],
    textModal: ['slate', 600, '模态框文字'],

    bg100: [bgBase, 100, '背景100'],
    bg200: [bgBase, 200, '背景200'],
    bg300: [bgBase, 300, '背景300'],
    bg400: [bgBase, 400, '背景400'],
    bg500: [bgBase, 500, '背景500'],
    bg600: [bgBase, 600, '背景600'],
    bg700: [bgBase, 700, '背景700'],
    bg800: [bgBase, 800, '背景800'],
    bg900: [bgBase, 900, '背景900'],
    bg1000: [bgBase, 1000, '背景1000'],

    bgIcon: [bgBase, 600, 'Bullet圆点内层背景'],
    bgIconHover: [base, 400, 'Bullet圆点内层背景(鼠标悬停)'],
    bgIconOutline: [bgBase, 400, 'Bullet圆点外层背景'],
    bgIconOutlineHover: [base, 100, 'Bullet圆点外层背景(鼠标悬停)'],

    // 边框
    border: [bgBase, 400, '边框'],
    borderNodeChild: [bgBase, 400, 'Bullet下级区框边框'],
    borderLinkHint: [bgBase, 400, '链接提示'],

    bgNavbar: [bgBase, 100, '导航栏背景'],
    bgNavbarItemHover: [bgBase, 200, '导航栏项背景(鼠标悬停)'],
    iconNavbar: [bgBase, 400, '导航栏图标'],
    textNavbar: [bgBase, 900, '导航栏文字'],

    bgMenu: ['grey', 100, '菜单背景'],
    bgMenuItemHover: [bgBase, 100, '菜单项背景(鼠标悬停)'],
    iconMenuItem: [bgBase, 400, '菜单项图标'],
    textMenuItem: [bgBase, 900, '菜单项文字'],

    iconSystem: [bgBase, 600, '系统图标'],
  }

  const generateColors: ResultColors = {} as any
  const generateTuples: ResultTuples = {} as any
  Object.keys(colors).forEach((key: any) => {
    const [mybase, depth, label] = (colors as any)[key]
    ;(generateColors as any)[key] = getColor(mybase, depth)
    ;(generateTuples as any)[key] = [mybase, depth, label]
  })
  return [generateColors, generateTuples]
}

export type ColorObject = {
  base: ColorBase
  depth: ColorDepth
  color: string
  hover: ColorObject
  calc(dep: number): ColorObject
}

export const toColorObj = (base: ColorBase, depth: ColorDepth): ColorObject => {
  return {
    base,
    depth,
    get color() {
      return getColor(base, depth)
    },
    calc(dep: number): ColorObject {
      return toColorObj(base, (depth as any) + dep)
    },
    get hover() {
      return toColorObj(base, (depth as any) + 100)
    },
  }
}

export const isColorObject = (v: any): boolean => {
  return (
    typeof v === 'object' &&
    typeof v.base === 'string' &&
    typeof v.depth === 'number'
  )
}

export const getColor = (
  baseColor: ColorBase | ColorTuple | ColorObject,
  depth?: ColorDepth
): ColorValue => {
  if (Array.isArray(baseColor)) {
    ;[baseColor, depth] = baseColor
  } else if (isColorObject(baseColor)) {
    ;[baseColor, depth] = [(baseColor as any).base, (baseColor as any).depth]
  }
  return colorCollection[baseColor as ColorBase].body[depth as ColorDepth]
}

/**
 * 对颜色的加深、变浅进行计算
 * @param val
 * @param dep
 * @returns
 */
export const calcColor = (val: ColorTuple, dep: number) => {
  // 对于不是整百的数进行修正
  dep = Math.round(dep / 100) * 100
  // eslint-disable-next-line prefer-const
  let [base, depth] = val

  if (depth <= 100) {
    if (dep < 0) {
      dep /= 10
    } else {
      depth = 100
      dep = 0
    }
  }

  if (val[1] < 70 || dep > 1000) {
    dep = 0
  }

  return getColor([base, (dep + depth) as ColorDepth])
}

/**
 * 通过背景颜色计算文字颜色
 * @param base
 * @param depth
 * @returns
 */
export function calcTextColorByBackgroundColor(
  base: ColorBase,
  depth: ColorDepth
): ColorTuple {
  const color = colorCollection[base].body[depth]
  let textBase: ColorBase
  let textDepth: ColorDepth
  if (depth <= 300) {
    textBase = 'grey'
    textDepth = 1000
  } else {
    textBase = 'grey'
    textDepth = 100
  }
  return [textBase, textDepth]
}
