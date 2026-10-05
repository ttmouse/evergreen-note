import { $t } from '../../../../i18n'

// 用 JS 写 CSS，以便以后提供功能让用户修改样式
export const customMarkStyles = {
  normal: {
    title: $t`customMark.normal`,
    value: '',
  },

  red: {
    title: $t`customMark.red`,
    value: `color: var(--cl-red-700);`,
  },
  green: {
    title: $t`customMark.green`,
    value: `color: var(--cl-green-700);`,
  },
  blue: {
    title: $t`customMark.blue`,
    value: `color: var(--cl-blue-700);`,
  },
  yellow: {
    title: $t`customMark.yellow`,
    value: `color: var(--cl-orange-700);`,
  },

  subscript: {
    title: $t`customMark.subscript`,
    value: `
      vertical-align: sub;
      font-size: 0.6em;
      display: inline-block;
      transform: translateY(-0.3em);
    `,
  },
  superscript: {
    title: $t`customMark.superscript`,
    value: `
      vertical-align: super;
      font-size: 0.6em;
      display: inline-block;
      transform: translateY(0.1em);
    `,
  },

  above: {
    title: $t`customMark.above`,
    value: `
      display: inline-flex;
      flex-wrap: wrap;
      flex-direction: column-reverse;
      justify-content: center;
      align-items: center;
      margin-right: 4px;

      svg {
        display: none;
      }

      .data-note-inner {
        display: inline-block;
      }
    `,
  },
}
