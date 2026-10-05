import React from 'react'
import { AutoComplete } from '../../components/AutoComplete/AutoComplete'
import { UnitProps } from '../../interfaces/unit'
import { useAddons } from '../../hooks/useAddons'
import { ItemEditor } from '../..'
import { ContextEditor } from '../EditorView/EditorViewContexts'

export const ReferMenuComp = React.memo(() => {
  const editor = React.useContext(ContextEditor) as ItemEditor
  const { refer } = useAddons()

  const handleSelect = ({
    item,
    closeMenu,
  }: {
    item: UnitProps
    closeMenu: (isClose: boolean) => void
  }) => {
    item?.handle({ editor, closeMenu })
    closeMenu(true)
  }

  return (
    <AutoComplete
      id="refer-autocomplete"
      handleSelect={handleSelect}
      recoverKey='('
      styleOuter={{ width: '500px' }}
      {...refer.getSuggestMenu({ editor })}
    />
  )
})
