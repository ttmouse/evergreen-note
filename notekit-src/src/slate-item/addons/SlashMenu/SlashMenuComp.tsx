import React from 'react'
import { AutoComplete } from '../../components/AutoComplete/AutoComplete'
import { UnitProps } from '../../interfaces/unit'
import { useAddons } from '../../hooks/useAddons'
import { ItemEditor } from '../..'
import { ContextEditor } from '../EditorView/EditorViewContexts'

export function SlashMenuComp() {
  // const { editor } = props;
  const editor = React.useContext(ContextEditor) as ItemEditor
  const { slashMenu } = useAddons()
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
      id="slash-autocomplete"
      handleSelect={handleSelect}
      recoverKey='/'
      {...slashMenu.getSuggestMenu({ editor })}
    />
  )
}
