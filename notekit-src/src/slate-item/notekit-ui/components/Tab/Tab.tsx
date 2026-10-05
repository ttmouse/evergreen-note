import React from 'react'
import { ATOMIC_CLASS_MAP, Brick, BrickProps } from '../Brick/Brick'
import './Tab.less'

export type TabProps = BrickProps & {
  active?: boolean
}

export function Tab(props: TabProps) {
  const { isActive, cssClass = [], ...rest } = props
  if (isActive) {
    cssClass.push('is-active')
  }
  return (
    <Brick
      {...rest}
      type="tab-item"
      cssClass={cssClass}
      partClasses={{
        ...ATOMIC_CLASS_MAP,
        outer: 'tab',
      }}
    />
  )
}

export type TabListProps = BrickProps & {
  activeKey?: number | string
  subitems: TabProps[]
}

export function TabList(props: TabListProps) {
  const { subitems, ...rest } = props

  return (
    <Brick
      {...rest}
      type="tab-list"
      partClasses={{
        ...ATOMIC_CLASS_MAP,
        outer: 'tabs',
      }}
      subitems={subitems.map((item, index) => (
        <Tab
          {...item}
          // onClick={(e: React.MouseEvent) => {
          //   setActiveIndex(index)
          //   if (item.onClick) {
          //     item.onClick(e)
          //   }
          // }}
          key={index}
          isActive={item.active}
        />
      ))}
    />
  )
}
