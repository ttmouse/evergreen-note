import React from 'react'
import { cls, colorBase } from '../../styles'
import { key2symbol } from '../Hotkey/helper'
import { appendStyle } from '../../utils/dom/appendStyle'

appendStyle(cls`
  .re-menu {

    .node {
      > .node-extra {
        .extra-hotkey {
          transition: all 0.2s;
          Opacity: 0;
        }
      }

      &:hover {
        .extra-hotkey {
          Opacity: 1;
        }
      }
    }
  }
`)

const extraStyle = [
  cls`
    label: extra-hotley;
    font-size: 12px;
    transition: all 0.3s;
    &:hover {
      font-size: 14px;
      color: var(--cl-slate-500);
    }
  `,
  'extra-hotkey',
]

export function extraHotkey(item: any) {
  if (item.hotkey) {
    item.extra = [
      {
        title: (
          <span className={extraStyle.join(' ')}>
            {key2symbol(item.hotkey)}
          </span>
        ),
        unitType: 'UnitView',
      },
    ]
  }
}
