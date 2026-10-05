import { atom, cls, colorBase, colors, preColor } from '../../styles'

export const menuStyles = [
  {
    node: cls`
      label: menu;
      display: flex;
      flex-direction: column;
      flex-wrap: nowrap;
      width: 240px;
      /* 菜单操作文字统一小于正文；portal 中的二级菜单也使用同一字号。 */
      font-size: 14px;
      ${atom.mobile(`
        width: 100vw;
      `)};

      background-color: ${preColor.white};
      /* 圆角与 MUI paper 对齐（10px）；投影取消，改由 theme 的 1px 边线表达浮层层级 */
      border-radius: 10px;
    `,
    head: cls`
      display: none;
    `,
    body: cls`
      flex-grow: 1;
      /* 上下留 6px，首尾项的悬停底色不再顶到面板圆角 */
      padding-top: 6px;
      padding-bottom: 6px;
      max-height: 400px;
      min-width: 200px;
      overflow-y: auto;
    `,
    child: cls`
      display: flex;
      flex-wrap: wrap;
    `,
  },

  {
    node: cls`
      label: menu-item;
      flex-basis: 100%;
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      position: relative;
      user-select: none;
      padding-left: 12px;
      padding-right: 12px;
      cursor: pointer;
      width: 100%;
      min-height: 32px;
      ${atom.mobile(`
        min-height: 40px;
      `)};

      &:hover {
        background-color: ${[colorBase.secondary, 100]};
      }

      &[data-selected='true'] {
        background-color: ${[colorBase.secondary, 200]};
      }
    `,
    icon: cls`
      /* 16px 固定图标槽：所有菜单项的标题左缘对齐，图标用 muted 中性色（比原 slate-400 更深，夜间由 token 自动转浅） */
      flex: 0 0 16px;
      display: flex;
      align-items: center;
      justify-content: center;
      margin-left: 6px;
      margin-right: 10px;
      color: var(--nk-muted, ${colors.iconMenuItem});

      & > svg {
        width: 16px;
        height: 16px;
      }

      & > svg path {
        fill: currentColor;
      }
    `,
    head: cls`
      display: flex;
      flex-grow: 1;
      align-items: center;
      line-height: 200%;
      color: ${colors.textMenuItem};

      ${atom.text.truncate()}
    `,
    body: cls`
      position: fixed;
      width: 240px;
    `,
    extra: cls`
      display: flex;
      justify-content: flex-end;
      align-items: center;
      position: absolute;
      right: 4px;
      padding: 4px 8px;
      color: var(--nk-muted, ${colors.iconMenuItem});

      .node-icon {
        display: flex;
        align-items: center;
      }
    `,
    foot: cls`
      border-top: 1px solid var(--nk-line);
      display: flex;
      justify-content: center;
      min-width: 100%;
      padding-top: 4px;
      padding-bottom: 4px;
    `,
  },
]
