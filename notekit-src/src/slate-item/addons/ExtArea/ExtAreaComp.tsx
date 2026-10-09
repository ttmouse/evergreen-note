import React, { useEffect } from 'react'
import { atom, cls, px } from '../../styles/atom'
import { observer } from 'mobx-react'
import { useAddons } from '../../hooks/useAddons'
import { Item, KyString, UnitProps } from '../..'
import { EleBody, EleHead, EleSubitems } from '../../components/Ele'
import { listStyles } from '../../components/List/List.style'
import { icons } from '../../../components/SvgIcon'
import { PartOuter, PartExtra } from '../../components/UnitView/Parts'
import { $t } from '../../../i18n'
import { isEmpty } from '../../utils/isEmpty'
import { getUserKeys } from '../Hotkey/helper'

export const editorHeadlessStyle = cls`
  & > .editor-view {
    > .node-extra {
      display: none;
    }

    > .node-body > .node-child > .node {
      > *:not(.node-body) {
        display: none;
      }

      > .node-body {
        margin-top: 4px;
      }
    }
  }
`

const ExtAreaItem = (props: { ky: KyString }) => {
  const { ky } = props
  const { extArea, editorView } = useAddons()
  const EditorComponent = editorView.createComponent()

  let item = extArea.getItem(ky)
  if (!item.topic && item.pky) {
    item = {
      ...item,
      ky: item.pky,
      subitems: [item],
    }
  }

  const [foldup, setFoldup] = React.useState(false)

  const op = !foldup
    ? {
        icon: 'svg_arrow_down2',
        title: $t`common.collapse`,
        size: 22,
        onClick() {
          setFoldup(true)
        },
      }
    : {
        icon: 'svg_arrow_right2',
        title: $t`common.expand`,
        size: 22,
        onClick() {
          setFoldup(false)
        },
      }

  const extra: Partial<UnitProps> = [
    {
      icon: 'svg_close',
      size: 18,
      title: $t`common.close`,
      onClick: () => {
        extArea.remove(ky)
      },
    },
    op,
  ]

  return (
    <PartOuter
      classOuter={[
        cls`
          position: relative;
          flex-basis: 100%;

          & ~ .node {
            border-top: 1px solid var(--cl-slate-300);
            margin-top: ${px(20)};
          }`,
        'ext-area',
      ].join(' ')}
    >
      <PartExtra extra={extra as any} classExtra={listStyles[1].extra} />
      <EleHead
        classHead={cls`
          padding-left: ${px(8)};
          padding-top: ${px(8)};
          font-size: ${px(18)};
          font-weight: 600;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          max-width: 75%;
          label: ext-item-head;
        `}
      >
        Topic: {Item.headString(item)}
      </EleHead>
      <EleBody
        classBody={foldup ? cls`display:none` : cls`padding-right:${px(28)}`}
      >
        <EleSubitems classChild={editorHeadlessStyle}>
          <EditorComponent item={item} backlink={false} />
        </EleSubitems>
      </EleBody>
    </PartOuter>
  )
}

const width = 500

const foldup = `
  margin-right: -${px(width - 2)};
  margin-top: ${px(40)};
`

export const ExtAreaComp = observer(() => {
  const { extArea, editorView, app } = useAddons()

  let cssClass = cls`
    position: relative;
    z-index: 10;
    background-color: #fcfcfc;
    flex-basis: ${px(width)};
    height: 100%;
    overflow-wrap: break-word;
    overflow-x: hidden;
    overflow-y: auto;
    padding: 4px 0 4px 8px;
    transition: all 0.7s;

    ${atom.md(foldup)};

    &.node-foldup {
      ${foldup};

      &:hover {
        transform: translateX(-${px(width - 3)});
        box-shadow: -1px -1px 1px var(--cl-slate-200);
        border-top-left-radius: 4px;
      }
    }
  `

  let expandBtn = {
    size: 18,
    icon: 'svg_arrow_double_right',
    title: $t`common.collapse`,
    onClick() {
      extArea.foldup()
    },
  }

  if (app.states.extAreaFoldup) {
    cssClass += ' node-foldup'

    expandBtn = {
      size: 18,
      icon: icons.svg_arrow_double_left,
      title: $t`common.expand`,
      onClick() {
        extArea.foldup(false)
        if (isEmpty(app.states.extAreaItems) && editorView.currentItemKy) {
          extArea.add({
            type: 'topic',
            key: editorView.currentItemKy,
          })
        }
      },
    }
  }

  const extraList = [
    {
      icon: 'svg_clear',
      title: $t`common.clear`,
      size: 18,
      onClick: () => {
        extArea.clear()
      },
    },
    expandBtn,
  ]

  return isEmpty(app.states.extAreaItems) ? null : (
    <PartOuter
      classOuter={[cssClass, 'extarea'].join(' ')}
      foldup={app.states.extAreaFoldup}
    >
      <PartExtra
        classExtra={`${listStyles[1].extra}`}
        extra={extraList as any}
      />
      <EleHead>&nbsp;</EleHead>
      <EleBody>
        <EleSubitems classChild={cls`flex-wrap: wrap;`}>
          {app.states.extAreaItems!
            .map((extItem: any) => {
              if (['topic', 'item'].includes(extItem.type)) {
                const k = `topic-${extItem.key}`
                return <ExtAreaItem key={k} ky={extItem.key} />
              }
              return null
            })}
        </EleSubitems>
      </EleBody>
    </PartOuter>
  )
})
