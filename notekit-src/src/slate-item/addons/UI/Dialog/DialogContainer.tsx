import React from 'react'
import { observer } from 'mobx-react'
import { useAddons } from '../../../hooks/useAddons'

export const DialogContainer = observer(() => {
  const { dialog, ui } = useAddons()

  return (
    <div
      className="dialog-container"
      style={{ zIndex: ui.zIndexManager.groups.dialog }}
    >
      {dialog.dialogComponents.map((one) => {
        const Comp = one.comp
        return <Comp key={`dialog-${one.id}`} />
      })}
    </div>
  )
})