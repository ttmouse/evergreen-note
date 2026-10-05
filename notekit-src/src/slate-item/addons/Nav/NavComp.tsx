import React from 'react'
import { LibTitleComp } from '../LibAdmin/LibTitleComp'
import { List } from '../../components'
import { cls, atom, px, colorBase, preset } from '../../styles'
import { useAddons } from '../../hooks/useAddons'
import { observer } from 'mobx-react'
import { useAppStates } from '../../hooks/useAppStates'
import { browser } from '@/slate-item/utils/browser'

const leftWidth = 240
const hideIconHeight = 44

const foldupHover = `
  transform: translateX(${px(leftWidth - 3)});
`

const foldupStyle = `
  margin-left: -${px(leftWidth - 2)};
  margin-top: ${px(hideIconHeight)};
  border-top-right-radius: ${px(5)};
  z-index: 60000;
  ${preset.shadow.basic}

  .node[data-icon='foldup'] {
    display: none;
  }

  & ~ .node[data-icon='expand'] {
    display: flex;
  }

  &:hover {
    ${browser.isMobile?'':foldupHover};
  }

  & ~ .main-area .node-crumbs {
    margin-left: ${px(30)};
  }
`

const editNavStyle = [
  {
    node: cls`
      background-color: ${[colorBase.secondary, 100]};
      flex-grow: 0;
      flex-shrink: 0;
      width: ${px(leftWidth)};
      transition: transform 160ms ease-out;

      .node-empty-text:not(.divider) {
        display: none !important;
      }

      .node[data-name='recent'] .node-head {
        ${atom.text.truncate({ maxWidth: leftWidth - 40 })}
      }

      .node-extra,
      .lib-title svg {
        opacity: 0;
        transition: opacity 140ms ease-out;
      }

      &:hover, &:focus-within {
        .node-extra,
        .lib-title svg {
          opacity: 1;
        }
      }

      ${atom.md(foldupStyle)};

      &.node-foldup {
        ${foldupStyle};
      }
      &[foldup=true].trigger-hover {
        ${foldupHover};
      }
      
      ${atom.md("&.trigger-hover {"+foldupHover+";}")}

      > .node-body > .node-child > .node {
        > .node-body > .node-child > .node {
          .node-head {
            font-size: 14px;
          }
        }
      }
    `,
  },
]

export const NavComp = observer(() => {
  const { nav, app } = useAddons()
  const { appName } = app

  // eslint-disable-next-line prettier/prettier
  const {
    navFoldup = false,
    navTitle = <div className="nk-nav-brand">Evergreen note</div>,
    navCommands = {},
  } = useAppStates()

  const body: any[] = []
  for (const [k, info] of Object.entries(navCommands)) {
    body.push({
      id: `${appName}-${k}`,
      'data-name': k,
      ...(info as any),
      rowClassName: 'nk-nav-row',
    })
  }
  body.sort((a, b) => a.order - b.order)
  const extra = Object.values(nav.extraCommands)
  return (
    <List
      id={nav.id}
      eleTag="nav"
      classOuter={[editNavStyle[0].node, 'nav-area'].join(' ')}
      title={navTitle as any}
      extra={extra as any}
      body={body}
      foot={LibTitleComp}
      foldup={navFoldup}
    />
  )
})
