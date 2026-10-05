import React from 'react'
import { UnitProps } from '../../interfaces/unit'
import { isEmpty } from '../../utils/isEmpty'
import { PartIconForIconList } from '../IconList'
import { cls, preset } from '../../styles'
import { Menu } from '../Menu'
import { PartHead } from '../UnitView/PartHead'
import { PartOuter } from '../UnitView/Parts'
import { mkid } from '../../utils/string/mkid'
import Popover from '@mui/material/Popover'
import { appendStyle } from '../../utils/dom/appendStyle'
import { usePubState } from '../../hooks/usePubState'
import { pub } from '../../utils/pub'
import { withFilterBox } from './withFilterBox'
import { Tip } from '../Tip/Tip'
import { formatHotkey } from '../../addons/Hotkey/helper'
import { topZIndex } from '../../hooks/useTopZIndex'
import { browser } from '@/slate-item/utils/browser'

const partProps = {
  node: cls`aspect-ratio: 1 / 1;${browser.isAppleMobile || browser.isMacSafari ? 'width: 1.5em;' : ''}`,
  icon: cls(preset.icon.basic),
  head: cls`display: none`,
  body: cls`display: none`,
}

// 浮层不叠投影：层级由 1px 边线表达（见 workspace-theme.css 的同款说明）。
// 这里显式清零，避免 MUI paper 自带 elevation 与主题规则抢优先级。
appendStyle(cls`
  .popup-menu-wrap .MuiPaper-root,
  .MuiDialog-container > .MuiPaper-root {
    label: item-icon;
    box-shadow: none;
  }
`)

function visibleKey(id: string) {
  return `sub-visible:${id}`
}

export function setSubVisible(id: string, isVisible: boolean) {
  pub.setState(visibleKey(id), isVisible)
}

export type PopoverSubitemsNeededProps = {
  id: string
  name?: string
  subitems: Partial<UnitProps>[] | { [k: string]: Partial<UnitProps> }
  TriggerComp: (props: {
    onClick: (e: React.MouseEvent<HTMLElement>) => void
    onMouseEnter?: (e: React.MouseEvent<HTMLElement>) => void
  }) => JSX.Element
  onSelect?: (props: Partial<UnitProps>) => void
  filterable?: boolean // 是否开启过滤功能
}

export function PopoverSubitems(
  props: Partial<UnitProps> & PopoverSubitemsNeededProps
) {
  const {
    subitems,
    id = mkid(),
    name,
    TriggerComp,
    onSelect,
    filterable,
  } = props

  const [isShow, showIt] = usePubState(visibleKey(id), false)

  const [anchorEl, setAnchorEl] = React.useState<HTMLElement | null>(null)
  const handleClick = (event: React.MouseEvent<HTMLElement>) => {
    showIt(true)
    setAnchorEl(event.currentTarget)
    event.stopPropagation()
  }

  const handleClose = () => {
    setAnchorEl(null)
  }

  const open = Boolean(anchorEl)
  const handleSelect = (v: any) => {
    onSelect && onSelect(v)
    handleClose()
  }

  const Menu2 = isEmpty(subitems)
    ? () => null
    : withFilterBox(Menu, {
      subitems: Object.values(subitems),
    })

  React.useEffect(() => {
    const el = document.getElementById(id)?.closest('.MuiPopover-root') as HTMLElement
    el && topZIndex(el)
  })

  if (browser.isMobile && !isEmpty(subitems) && subitems[0].title!=="Close") subitems.unshift({
    title: "Close", icon: "svg_close", onClick() {
      showIt(false)
    }
  } as unknown as UnitProps)

  return (
    <>
      <TriggerComp onClick={handleClick} />
      {isEmpty(subitems) || !isShow ? null : (
        <Popover
          id={id}
          open={open}
          anchorEl={anchorEl}
          onClose={handleClose}
          anchorOrigin={{
            vertical: 'bottom',
            horizontal: 'right',
          }}
          transformOrigin={{
            vertical: 'top',
            horizontal: 'right',
          }}
          className="popup-menu-wrap"
        >
          {!filterable ? (
            <Menu
              onSelect={handleSelect}
              body={Object.values(subitems)}
              id={id}
              name={name ?? id}
            />
          ) : (
            <Menu2 onSelect={handleSelect} id={id} name={name ?? id} />
          )}
        </Popover>
      )}
    </>
  )
}

export const IconItem = React.forwardRef((props: Partial<UnitProps>, ref) => {
  const { iconSize, id = mkid(), subitems, title, hotkey, ...rest } = props
  // The outer item owns keyboard activation, not its decorative icon/head.
  const { role, tabIndex, onKeyDown, ...contentProps } = rest

  if (!isEmpty(rest.layout)) {
    rest.layoutContext = null
    rest.layoutDepth = 0
  }

  // 悬浮提示带上快捷键，让用户不必去快捷键面板翻
  const tipTitle =
    !isEmpty(title) && !isEmpty(hotkey)
      ? `${title} · ${formatHotkey(hotkey as string | string[])}`
      : title

  const comp = (p: any) => (
    <Tip title={tipTitle as any}>
      <PartOuter
        {...rest}
        classOuter={`${partProps.node} ${rest.classOuter}`}
        ref={ref}
        {...p}
      >
        <PartIconForIconList
          classIcon={partProps.icon}
          size={iconSize}
          {...contentProps}
        />
        <PartHead classHead={partProps.head} {...contentProps} />
      </PartOuter>
    </Tip>
  )

  return <PopoverSubitems id={id} subitems={subitems} TriggerComp={comp} />
})
