import React from 'react'
import { NPart } from '../NPart/NPart'
import './Mask.less'
import ReactDOM from 'react-dom'

export type MaskProps = {
  opacity?: number
  container?: HTMLElement
}

export function Mask(props: MaskProps): JSX.Element {
  const { opacity, container = document.body } = props
  return ReactDOM.createPortal(
    <NPart cssClass="nui-mask" style={{ opacity }} />,
    container
  )
}
