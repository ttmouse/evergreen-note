import styled from '@emotion/styled'
import {
  calcTextColorByBackgroundColor,
  ColorBase,
  ColorDepth,
} from '../styles/theme'

export const Keyword = styled.span(
  (props: { color?: string; depth?: number; hoverDepth?: number }) => {
    const { color = 'blue', depth = 500, hoverDepth } = props
    const [c, d] = calcTextColorByBackgroundColor(
      color as ColorBase,
      depth as ColorDepth
    )
    return `
      display: inline-flex;
      align-items: center;
      padding: 1px 4px 0;
      max-height: 20px;
      border-radius: 4px;
      font-size: 10px;
      color: var(--cl-${c}-${d});
      background-color: var(--cl-${color}-${depth});
      transition: all 0.2s ease-in-out;

      &:hover {
        background-color: var(--cl-${color}-${hoverDepth ?? depth + 100});
      }
    `
  }
)
