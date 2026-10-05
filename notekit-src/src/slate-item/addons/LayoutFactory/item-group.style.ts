import { atom, cls, colorBase, colors, getColor, preset } from '../../styles';
import { ItemStyle } from './LayoutFactory';
import { layoutStyleDefault } from './default.style';

const [s] = layoutStyleDefault;
export const layoutStyleItemGroup: ItemStyle[] = [
  {
    outer: cls`
      ${s.outer};
    `,

    tools: s.tools,

    icon: cls`
      ${s.icon};
    `,
    head: cls`
      ${s.head};
    `,
    text: cls`
      user-select: none;
      cursor: pointer;
      font-size: 20px;
      color: ${[colorBase.primary, 600]};

      &:hover {
        color: ${[colorBase.primary, 700]};
      }
    `,
    body: cls`
      margin-top: 10px;
      margin-left: 0px;
      border-left: 0px;
      padding-left: 10px;
      min-width: 100%;
    `,
    child: cls`
      > .node {
        margin-bottom: 10px;
        border-radius: 4px;
        padding: 4px;
        outline: 1px solid var(--cl-slate-200);
        transition: 0.5s all;

        &:hover {
          outline: 1px solid var(--cl-slate-300);
        }
      }
    `,
  },
];

export const layoutStyleResultNoGroupResult: ItemStyle[] = [
  {
    outer: [s.outer].join(' '),
    tools: s.tools,
    icon: [s.icon, cls``].join(' '),

    head: [s.head, cls``].join(' '),

    text: cls`
      color: var(--cl-slate-300);
      font-weight: bold;
    `,
    body: cls`
      margin-top: 10px;
      margin-left: 0px;
      border-left: 0px;
      padding-left: 10px;
      min-width: 100%;
    `,
    child: cls`
      > .node {
        margin-bottom: 10px;
        border-radius: 4px;
        padding: 4px;
        outline: 1px solid var(--cl-slate-200);
        transition: 0.5s all;

        &:hover {
          outline: 1px solid var(--cl-slate-300);
        }
      }
    `,
  },
];