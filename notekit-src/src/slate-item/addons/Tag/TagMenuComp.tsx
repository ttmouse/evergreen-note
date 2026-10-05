import React from 'react'
import { AutoComplete } from '../../components/AutoComplete/AutoComplete'
import { UnitProps } from '../../interfaces/unit'
import { useAddons } from '../../hooks/useAddons'
import { ItemEditor } from '../..'
import { ContextEditor } from '../EditorView/EditorViewContexts'

export function TagMenuComp() {
  const editor = React.useContext(ContextEditor) as ItemEditor
  const $ = useAddons()

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
      id="tag-autocomplete"
      handleSelect={handleSelect}
      recoverKey="#"
      {...$.tag.getSuggestMenu({ editor })}
    />
  )
}
