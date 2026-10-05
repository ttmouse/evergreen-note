import React from 'react'
import { UnitCrumbItem } from '../../interfaces/unit'
import { cls, px } from '../../styles'
import { CrumbsComp } from '../Crumbs/CrumbsComp'

const style = cls`
  min-width: 100%;
  padding-left: 8px;
  font-size: 14px;

  svg {
    width: 10px;
    height: 10px;
  }

  ~ .node-head {
    margin-top: 8px;
  }
`
export function Crumbs(props: { crumbs: UnitCrumbItem[] }) {
  const { crumbs } = props
  return (
    <div className={[style, 'node-crumbs'].join(' ')}>
      <CrumbsComp crumbs={crumbs} />
    </div>
  )
}
