import React from 'react'
import { Icon } from '../../../components/MaterialIcon'
import { icons } from '../../../components/SvgIcon'
import { UnitProps } from '../../interfaces/unit'
import { useEditorProps } from '../../addons/EditorView/useEditorProps'

export type FloatMenuProps = {
  subitems: Partial<UnitProps>[]
}

export function ItemMenuBtn() {
  const { readOnly } = useEditorProps()

  if (readOnly) {
    return null
  }

  return (
    <div className="tool-item bullet-menu-btn">
      <Icon name={icons.svg_menu} size={16} />
    </div>
  )
}
