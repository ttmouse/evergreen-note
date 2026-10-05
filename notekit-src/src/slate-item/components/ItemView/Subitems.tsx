import React from 'react'
import { ElementComponentProps } from '../../addons/EditorView/EditorView'
import { useCreateItemOnClick } from '../../hooks/useCreateItemOnClick'
import { useItemLayoutStyle } from '../../hooks/useItemLayoutStyle'
import { useSlateRef } from '../../hooks/useSlateRef'
import { Text } from '../../slate.inc'

export const Subitems = (props: ElementComponentProps<any>) => {
  const { attributes, children, element } = props
  const itemStyle = useItemLayoutStyle()

  const { ref: slateRef, ...restAttrs } = attributes
  const [domRef, mergedRef] = useSlateRef(slateRef)
  React.useEffect(() => {
    if (Text.isText(element.children[0])) {
      domRef.current?.closest('.node')?.classList.add('subitems-empty')
    } else {
      domRef.current?.closest('.node')?.classList.remove('subitems-empty')
    }
  })

  useCreateItemOnClick(domRef)

  return (
    <div
      className={`${itemStyle.child} node-child node-subitems`}
      {...(restAttrs as any)}
      ref={mergedRef}
    >
      {children}
    </div>
  )
}
