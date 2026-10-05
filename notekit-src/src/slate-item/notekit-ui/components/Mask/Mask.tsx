import React from 'react'
import { NPart } from '../NPart/NPart'
import './Mask.less'
import ReactDOM from 'react-dom'

export type MaskProps = {
  opacity?: number
}

export function Mask(props: MaskProps): JSX.Element {
  const { opacity } = props
  return ReactDOM.createPortal(
    <NPart cssClass="nui-mask" style={{ opacity }} />,
    document.body
  )
}
