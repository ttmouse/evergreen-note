import { cls } from '../../styles/atom';
import { colors } from '../../styles/colors';

export const listStyles = [
  {
    node: cls`
      position: relative;
      display: flex;
      flex-direction: column;
      flex-wrap: nowrap;
      padding-left: 5px;
    `,
    head: cls`
      padding: 12px 0px 12px 12px;
    `,
    extra: cls`
      display: flex;
      justify-content: flex-end;
      align-items: center;
      position: absolute;
      right: 0;
      top: 4px;
      padding: 4px 8px;
      color: ${colors.iconNavbar}
    `,
    body: cls`
      flex-grow: 1;
      overflow-y: auto;
    `,
    child: cls`
      display: flex;
      flex-wrap: wrap;
    `,
  },

  {
    node: cls`
      flex-basis: 100%;
      position: relative;
      user-select: none;
      padding-left: 12px;
      cursor: pointer;
      transition: all 0.3s ease;
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      `,
    icon: cls`
      padding-top: 4px;
      padding-bottom: 4px;
      font-size: 16px;
      display: flex;
      align-items: center;
      flex-grow: 0;
      color: ${colors.iconNavbar};
    `,
    head: cls`
      font-size: 16px;
      color: ${colors.textNavbar};
      flex-grow: 1;
      display: flex;
      align-items: center;
      padding: 4px 12px;
      line-height: 160%;

      &:hover {
        background-color: ${colors.bgNavbarItemHover};
      }
    `,
    body: cls`
      flex-basis: 100%;
      opacity: 0.6;
      transition: all 0.3s;

      &:hover {
        opacity: 1;
      }
    `,
    child: cls`
      > .node {
        flex-basis: 100%;
        padding-left: 0px;
        align-items: flex-start;

        > .node-head {
          flex-basis: calc(100% - 18px);
          word-break: break-all;
        }
      }
    `,
    extra: cls`
      display: flex;
      justify-content: flex-end;
      align-items: center;
      position: absolute;
      z-index: 10;
      right: 0;
      top: 4px;
      padding: 4px 8px;
      color: ${colors.iconNavbar};
    `,
  },
];
