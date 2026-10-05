import React from 'react'
import { KyString } from '../../interfaces/unit'

// 记录节点在编辑器的上级ID路径，用于检查节点是否存在递归嵌套
export const ContextPkyList = React.createContext<KyString[]>([])

export function useCheckBadRecur(ky: KyString) {
  const pkyList = React.useContext(ContextPkyList)
  return pkyList.includes(ky)
}
