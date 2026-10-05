/* eslint-disable @typescript-eslint/no-use-before-define */
import React from 'react'
import ReactDOM from 'react-dom'
import { useArrowSelect } from '../../hooks/useArrowSelect'
import { usePubState } from '../../hooks/usePubState'
import { UnitMode, UnitProps } from '../../interfaces/unit'
import { createTmpDom } from '../../utils/dom/createTmpDom'
import { isEmpty, notEmpty } from '../../utils/isEmpty'
import { mkid } from '../../utils/string/mkid'
import { CrumbsComp } from '../Crumbs/CrumbsComp'
import { EleBody, EleSubitems, EleFoot } from '../Ele'
import { IconList } from '../IconList/IconList'
import { PopupBox, PopupProps } from '../PopupBox'
import { PartHead } from '../UnitView/PartHead'
import { PartIcon } from '../UnitView/PartIcon'
import { PartOuter, PartExtra } from '../UnitView/Parts'
import { menuStyles } from './Menu.style'
import { browser } from '@/slate-item/utils/browser'
import { pub } from '../../utils/pub'
import { formatHotkey } from '../../addons/Hotkey/helper'

export const Menu = React.forwardRef((props: Partial<UnitProps>, ref) => {
  const { name, ...newProps } = props
  const { isClose } = newProps

  const [selectedIndex, bodyRef] = useArrowSelect(newProps as UnitProps)
  const subitems = Object.values(
    newProps.body ?? newProps.subitems ?? {}
  ) as UnitProps[]

  return isClose ? null : (
    <PartOuter
      classOuter={[menuStyles[0].node, 're-menu'].join(' ')}
      {...newProps}
      name={`menu-${name}`}
      ref={ref}
    >
      <EleBody classBody={menuStyles[0].body} ref={bodyRef}>
        <EleSubitems classChild={menuStyles[0].child}>
          {subitems?.map((subItem, i) => {
            return (
              <MenuItem
                key={i}
                data-selected={selectedIndex === i}
                closeMenu={props.closeMenu}
                {...subItem}
              />
            )
          })}
        </EleSubitems>
      </EleBody>
    </PartOuter>
  )
})

export const PopupMenu = (
  props: Partial<UnitProps> & { PopupProps: PopupProps }
) => {
  const { PopupProps: popupProps, clickaway, id = mkid() } = props
  const [isShow, show] = usePubState(id, true)
  return !isShow ? null : (
    <PopupBox {...popupProps} clickaway={clickaway} closeMenu={props.closeMenu}>
      <Menu {...props} />
    </PopupBox>
  )
}

export const SubMenu = (
  props: Partial<UnitProps> & { PopupProps: PopupProps }
) => {
  return ReactDOM.createPortal(
    <PopupMenu mode={UnitMode.ClickFirst} {...props} />,
    createTmpDom()
  )
}

export type MenuItemProps = UnitProps & {
  title: string | (() => string)
}

export const MenuItem = (props: Partial<MenuItemProps>) => {
  const { id: ID, ...newProps } = props
  const [subVisible, setSubMenuVisible] = React.useState(false)
  const [to, subMenuSnapTo] = React.useState({
    left: 0,
    top: 0,
    width: 0,
    height: 0,
  })
  const { iconSize, isSelected, hidden, id, title, hotkey, ...rest } = props
  // eslint-disable-next-line react/destructuring-assignment
  const body = props.body ?? props.subitems
  if (browser.isMobile && !isEmpty(props.subitems)) {
    if (props.subitems[0].title!=="Close") props.subitems.unshift({
    title: "Close", icon: "svg_close", onClick() {
      setSubMenuVisible(false)
    }})
  }

  const showMenu = (e: MouseEvent | React.TouchEvent) => {
    if (!isEmpty(body)) {
      const { left, top, width, height } = (
        e.currentTarget as HTMLElement
      ).getBoundingClientRect()
      subMenuSnapTo({
        left: left - 4,
        top,
        width,
        height,
      })
      setSubMenuVisible(true)
    }
  };

  const hideMenu = () => {
    setSubMenuVisible(false)
  }

  const handleMouseEnter = !browser.isMobile
    ? React.useCallback(showMenu, [body])
    : undefined

  const handleMouseLeave = !browser.isMobile
    ? React.useCallback(hideMenu, [])
    : undefined

  const handleClick = browser.isMobile
    ? React.useCallback(
        (e: React.TouchEvent) => {
          showMenu(e)
        },
        [body]
      )
    : undefined
  //React.useCallback(showMenu, [body])

  if (!isEmpty(body)) {
    newProps.extra ??= []
    newProps.extra.push({
      icon: 'svg_keyboard_arrow_right',
      unitType: 'UnitView',
    })
  }

  const classList = [menuStyles[1].node]
  if (isSelected) {
    classList.push('selected')
  }

  const newTitle = typeof title === 'function' ? (title as Function)() : title

  // 菜单项带 hotkey 时在标题后展示快捷键；FloatMenu 的 extraHotkey 已在
  // extra 里渲染过快捷键的（extra-hotkey 标记）不重复展示。
  const hasHotkeyExtra = (newProps.extra as any[])?.some?.(
    (e) => typeof e?.title?.props?.className === 'string'
      && e.title.props.className.includes('extra-hotkey')
  )
  const displayTitle =
    !isEmpty(hotkey) && !hasHotkeyExtra
      ? `${newTitle} · ${formatHotkey(hotkey as string | string[])}`
      : newTitle

  return (
    <PartOuter
      onMouseEnter={handleMouseEnter as any}
      onMouseLeave={handleMouseLeave as any}
      onClick={handleClick as any}
      classOuter={classList.join(' ')}
      id={id}
      {...newProps}
    >
      {hidden?.includes('icon') ? null : (
        <PartIcon classIcon={menuStyles[1].icon} size={iconSize} {...rest} />
      )}
      <PartExtra classExtra={menuStyles[1].extra} {...newProps} />
      {hidden?.includes('title') ? null : (
        <PartHead classHead={menuStyles[1].head} title={displayTitle} {...rest} />
      )}
      {!isEmpty(newProps.crumbs) && <CrumbsComp crumbs={newProps.crumbs} />}

      {subVisible ? (
        <EleBody>
          <SubMenu
            PopupProps={{ targetBox: to, place: ['right-out', 'middle'] }}
            {...rest}
            body={body}
          />
        </EleBody>
      ) : null}
      {isEmpty(newProps.foot) ? null : (
        <EleFoot className={menuStyles[1].foot}>
          <IconList body={newProps.foot} {...rest} />
        </EleFoot>
      )}
    </PartOuter>
  )
}
