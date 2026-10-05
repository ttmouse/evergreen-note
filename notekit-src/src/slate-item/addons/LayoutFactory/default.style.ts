import { colorBase } from '../../styles'
import { cls } from '../../styles/atom'
import { colors } from '../../styles/colors'
import { ItemStyle } from './LayoutFactory'

const nodeIconWidth = `${20}px`
const nodeIconColor = colors.bg400
const nodeIconBgColor = colors.bg200

export const layoutStyleDefault: ItemStyle[] = [
  {
    outer: cls`
      display: flex;
      flex-wrap: wrap;
      justify-content: space-between;
      align-items: baseline;
      padding-top: 4px;
      flex-basis: 100%;
      position: relative;
      caret-color: transparent;
      label: defaults;
      stkey: sty-outer-default;

      &.node-deleted {
        * {
          text-decoration: line-through !important;
          color: var(--cl-grey-300);
        }
      }

      &.node-foldup {

        > .node-tools .node-btn {
          background-color: ${nodeIconBgColor};
          outline: 1px solid ${nodeIconBgColor};
          transform: scale(0.75);
          svg {
            --scale: 1.33;

            &[name=document] {
              --scale: 0.8;
            }
          }
        }

        > .node-body {
          display: none !important;
        }
      }

      &.node-active > .node-tools {
        .tool-item {
          opacity: 1;
        }
      }
    `,

    tools: cls`
      flex-basis: 20px;
      flex-grow: 0;
      height: 20px;
      left: ${(27 - parseInt(nodeIconWidth, 10)) / 2}px;
      top: ${(27 - parseInt(nodeIconWidth, 10)) / 2}px;
      position: relative;
      label: defaults;

      &:hover {
        .tool-item {
          opacity: 1;
        }
      }

      .tool-list {
        height: 100%;
        position: absolute;
        right: 0px;
        top: 0px;
        display: flex;
        justify-content: flex-end;
      }

      .tool-item {
        border-radius: 100px;
        flex-basis: ${nodeIconWidth};
        height: ${nodeIconWidth};
        flex-grow: 0;
        flex-shrink: 0;
        display: flex;
        justify-content: center;
        align-items: center;
        cursor: pointer;
        background-color: var(--body-bg-color);
        opacity: 0;
        transition: 0.5s all;

        &.node-icon {
          opacity: 1;
          background-color: transparent;
        }

        ~ .tool-item {
          margin-left: 8px;
        }

        &:hover {
          transition: 0.5s all;
          background-color: ${nodeIconBgColor};
          transform: scale(1.1);
  
          &:empty::before {
            background-color: ${[colorBase.primary, 600]};
          }
        }

        svg {
          width: 16px;
          height: 16px;
          fill: ${nodeIconColor};
        }
      }
    `,

    icon: cls`
      position: relative;
      opacity: 1;
      label: defaults;
      stkey: sty-icon-default;

      svg[name=document] {
        width: 14px;
        height: 14px;
        margin-left: 2px;
        margin-top: 2px;
      }

      > .node-btn-more {
        position: absolute;
        top: 0;
        left: -100%;
        display: flex;
        align-items: center;
      }
    `,

    head: cls`
      flex-grow: 1;
      line-height: 160%;
      /* Keep the trailing gap with the head: outer bottom padding moves after
         all descendants and makes an indented row jump upward by 4px. */
      padding-bottom: 4px;
      padding-left: 10px;
      font-size: 16px;
      caret-color: auto !important;
      label: defaults;
      stkey: sty-head-default;

      &:not(.node-top > *) {
        flex-basis: calc(100% - 10px - ${nodeIconWidth});
        max-width: calc(100% - ${nodeIconWidth});
      }
    `,

    body: cls`
      opacity: 1;
      flex-basis: 100%;
      max-width: 100%;
      margin-left: 14px;
      padding-left: 14px;
      border-left: 1px solid transparent;
      transform-origin: 20px 10px;
      transform: scale(1);
      transition: all 0.15s;
      label: defaults;
      stkey: styl-body-default;

      &:hover {
        border-left-color: var(--cl-slate-300);
      }

      > span[data-slate-node] {
        display: none;
      }
    `,

    child: cls`
      min-width: 100%;
      label: defaults;
      stkey: child;

      > span[data-slate-node] {
        display: none;
      }
    `,

    quote: cls``,

    text: cls``,
  },
]

export const nodeStyle = layoutStyleDefault

export const layoutStyleDefaultTop: ItemStyle = {
  outer: cls`
    ${layoutStyleDefault[0].outer}
  `,
  tools: cls`
    display: none !important;
  `,
  icon: cls`
    ${layoutStyleDefault[0].icon};
  `,
  head: cls`
    ${layoutStyleDefault[0].head}
    margin-top: 30px;
    font-size: 30px;
    font-weight: bold;
    color: #333;
    padding-left: 8px;
    label: defaults;

    min-width: 100% !important;
    max-width: 100% !important;

    &:not(.dialog-body *) ~ .node-body {
      margin-top: 30px;
    }
  `,
  body: cls`
    ${layoutStyleDefault[0].body}
    flex-basis: 100%;
    padding-left: 0;
    margin-left: 0;
    border-left: 0;
    label: defaults;
  `,
  child: cls``,
  text: cls``,
  quote: cls``,
}

export const nodeStyleTop = layoutStyleDefaultTop
