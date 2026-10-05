import { IAddon, App, NewAddonParams } from '../../engine/App'
import { StrmapParams } from '../Strmap/Strmap'

export function createPanguSpaceAddon({ app, $ }: NewAddonParams) {
  class PanguSpace implements IAddon {
    app!: App
    config = {}

    addonInfo() {
      return {
        title: '盘古之白(Pangu spacing)',
        quote:
          '“盘古之白”是指在中文和英文混排的时候，中文和英文半角字母之间需要加入的那两个空格，这样既是优雅的，又是正确的（至少是W3C的一个规范，以及中国出版业的一个行业标准）。同样的，中文和数字之间，以及数字和单位之间，也都应该留有空白。',
        defaultValue: 'off',
        updated: 2023_12_25,
      }
    }

    addonRun() {
      $.strmap.addRules({
        spacing: {
          strmapRule: /([@#a-z0-9])([\u4e00-\u9fa5])/i,
          title: '盘古之白',
          handle: (params: StrmapParams) => {
            const { match } = params
            return `${match[1]} ${match[2]}`
          },
        },
        spacing2: {
          strmapRule: /([\u4e00-\u9fa5])([@#a-z0-9]+)/i,
          title: '盘古之白',
          handle: (params: StrmapParams) => {
            const { match } = params
            return `${match[1]} ${match[2]}`
          },
        },
      })
    }
  }

  return { panguSpace: new PanguSpace() }
}
