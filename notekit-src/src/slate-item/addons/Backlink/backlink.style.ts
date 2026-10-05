import { cls, colorBase, px } from '../../styles';
import { ItemStyle } from '../LayoutFactory/LayoutFactory';
import { layoutStyleDefault } from '../LayoutFactory/default.style';

const [s] = layoutStyleDefault;
export const layoutStyleBacklink: ItemStyle[] = [
  {
    outer: [s.outer].join(' '),
    tools: s.tools,
    icon: [s.icon, cls``].join(' '),

    head: [s.head, cls``].join(' '),

    text: cls`
      color: var(--cl-slate-300);
      font-weight: bold;
    `,

    body: [
      s.body,
      cls`
        margin-left: 0px;
        padding-left: 0px;
        padding-top: 10px;
        border-left: none;
        min-width: 100%;
      `,
    ].join(' '),
  },
];
