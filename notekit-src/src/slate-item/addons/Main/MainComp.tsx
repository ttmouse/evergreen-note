/* eslint-disable prettier/prettier */
import React from 'react'
import { useAddons } from '../../hooks/useAddons'
import { cla, cls, colors, px } from '../../styles'
import { obj2list } from '../EditorView/helper'
import { observer } from 'mobx-react'
import { EleBody, EleSubitems, EleCrumbs } from '../../components/Ele'
import { CrumbsComp } from '../../components/Crumbs/CrumbsComp'
import { ContextMainArea } from './MainContexts'
import { PartOuter, PartExtra } from '../../components/UnitView/Parts'
import { setSubVisible } from '../../components'
import { extraHotkey } from '../FloatMenu/helper'
import { Item } from '../../interfaces/item'
import { ArrowLeftIcon, ArrowRightIcon, SidebarSimpleIcon } from '@phosphor-icons/react'
import { MainCommands } from './Main'
import { useAppStates } from '../../hooks/useAppStates'
import { WorkspaceTabsComp } from './WorkspaceTabsComp'

const MainNavigationComp = observer(() => {
  const { main, nav } = useAddons()
  const { navFoldup } = useAppStates()
  const sidebarLabel = navFoldup ? '展开侧边栏' : '收起侧边栏'
  const modifier = /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘' : 'Ctrl'

  return (
    <div className="workspace-navigation" role="group" aria-label="页面导航">
      <button type="button" title="后退" aria-label="后退" onClick={(event) => main.moreExtraCommands.back.onClick?.(event)}>
        <ArrowLeftIcon size={20} aria-hidden="true" />
      </button>
      <button type="button" title="前进" aria-label="前进" onClick={(event) => main.moreExtraCommands.forward.onClick?.(event)}>
        <ArrowRightIcon size={20} aria-hidden="true" />
      </button>
      <button type="button" title={`${sidebarLabel} (${modifier}+,)`} aria-label={sidebarLabel} aria-controls={nav.id} aria-expanded={!navFoldup} onClick={() => nav.setFoldupState(!navFoldup)}>
        <SidebarSimpleIcon size={20} aria-hidden="true" />
      </button>
    </div>
  )
})

const rowStyles = [
  {
    extra: cls`
      display: flex;
      justify-content: flex-end;
      align-items: center;
      color: ${colors.iconSystem};
      flex: 1;
      > * {
        margin-left: 4px;
        margin-right: 4px;
        margin-top: 4px;
      }
    `,
  },
]

export const MainToolbarComp = (props: { id?: string; className?: string }) => {
  const { main } = useAddons()
  const commands: MainCommands = { ...main.extraCommands, more: { ...main.extraCommands.more } }
  const moreId = `${props.id ?? main.ids.extra}-more-dropdown`
  commands.more.subitems = React.useMemo(() => Object.values(main.moreExtraCommands).map((cmd) => {
    extraHotkey(cmd)
    return {
      ...cmd,
      onClick: (e: React.MouseEvent) => {
        setSubVisible(moreId, false)
        cmd.onClick?.(e)
      },
    }
  }), [main.moreExtraCommands, moreId])

  return (
    <PartExtra
      id={props.id ?? main.ids.extra}
      extra={obj2list(commands, (cmd, key) => key === 'more' ? { ...cmd, id: moreId } : cmd)}
      classExtra={`${rowStyles[0].extra} workspace-header-actions ${props.className ?? ''}`}
    />
  )
}

export const MainCrumbsComp = observer(() => {
  const { main, dbMemory } = useAddons()
  const crumbs = main.crumbs
  if (!crumbs?.length) return null
  // ?.map((c) => {
  //   if (c.ky && /\(\(.+?\)\)/.test(c.text)) {
  //     const item = dbMemory.getItem(c.ky)
  //     return {
  //       ...c,
  //       text: Item.headString(item, { parseRefer: true })
  //     }
  //   }
  //   return c
  // })
  return (
    <EleCrumbs
      id={main.ids.crumbs}
      classCrumbs={`workspace-header-crumbs ${cls`padding: ${px(6)} ${px(16)}; flex: none;`}`}
    >
      <CrumbsComp crumbs={crumbs} truncate />
    </EleCrumbs>
  )
})

export const MainComp = () => {
  const { router, main } = useAddons()
  const RouterComponent = router.createComponent()

  return (
    <PartOuter
      id={main.ids.outer}
      classOuter={cla(`flex-grow: 1; position: relative;`, 'main-area')}
    >
      <div className="workspace-header">
        <MainNavigationComp />
        <WorkspaceTabsComp />
        <MainToolbarComp />
      </div>
      <MainCrumbsComp />
      <EleBody
        classBody={[
          cls`
            flex-grow: 1;
            overflow: auto;
            height: 100%;
            label: main-body;
          `,
          'scrollable',
        ].join(' ')}
      >
        <EleSubitems
          classChild={cls`
            display: flex;
            justify-content: center;
            display: flex;
            height: 100%;
          `}
          id={`${main.ids.subitems}`}
        >
          <ContextMainArea.Provider value>
            <RouterComponent />
          </ContextMainArea.Provider>
        </EleSubitems>
      </EleBody>
    </PartOuter>
  )
}
