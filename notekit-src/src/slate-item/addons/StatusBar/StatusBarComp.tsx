import React from 'react'
import { cls, colorBase } from '../../styles'
import { useAddons } from '../../hooks/useAddons'

export type StatusBarProps = {}
export const STATUS_BAR_HEIGHT = 20

const statusBarStyle = cls`
  display: flex;
  align-items: center;
  flex-wrap: nowrap;
  width: 100%;
  height: ${STATUS_BAR_HEIGHT}px;
  background-color: var(--body-bg-color);
  position: fixed;
  bottom: 0px;
  left: 0px;
  font-size: 12px;
  padding: 0px 56px 0px 20px;
  justify-content: space-between;
  background-color: var(--cl-slate-100);
`

const warpStyle = cls`
  display: flex;
  flex-wrap: nowrap;
`

export function StatusBarComp() {
  const $ = useAddons()
  return (
    <div className={[statusBarStyle, 'status-bar'].join(' ')}>
      {Object.entries($.statusBar.components).map(([pos, comps]) => {
        const className = `${warpStyle} status-bar-${pos}`
        return (
          <div className={className} key={pos}>
            {comps.map((Comp, i) => (
              <Comp key={i} />
            ))}
          </div>
        )
      })}
    </div>
  )
}
