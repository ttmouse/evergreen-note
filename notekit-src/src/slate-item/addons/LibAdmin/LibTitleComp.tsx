import React from 'react'
import { observer } from 'mobx-react'
import { useAddons } from '../../hooks/useAddons'
import { CaretUpDownIcon, GearSixIcon } from '@phosphor-icons/react'

export const LibTitleComp = observer(() => {
  const $ = useAddons()
  const id = $.libAdmin.current.ky
  const title = $.libAdmin.store.get(id)?.ori ?? id
  return (
    <div className="nk-nav-footer">
      <button type="button" className="nk-library-switch" title={`切换数据库：${title}`} aria-label={`切换数据库，当前：${title}`} aria-haspopup="dialog" onClick={() => $.libAdmin.showList()}>
        <CaretUpDownIcon size={16} /><span>{title}</span>
      </button>
      <button type="button" className="nk-nav-settings" title="设置" aria-label="设置" onClick={() => $.prefer.showCfgForm()}><GearSixIcon size={18} /></button>
    </div>
  )
})
