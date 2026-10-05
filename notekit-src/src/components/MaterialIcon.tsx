import React from 'react'
import { SvgIcon, SvgIconName } from './SvgIcon'

export type PrimitiveIcon = SvgIconName
export const TextIcon = (props: { text: string; size: number; color?: string }) => {
  const { text, size, color } = props
  return <span style={{ fontSize: size - 2, color }}>{text.replace(/^text:/i, '')}</span>
}

export const Icon = (props: { name: PrimitiveIcon | 'none'; size?: number; color?: string }) => {
  const { name, size = 16, color } = props
  if (name === 'none') return null
  return <SvgIcon name={name} width={size} height={size} color={color} />
}
