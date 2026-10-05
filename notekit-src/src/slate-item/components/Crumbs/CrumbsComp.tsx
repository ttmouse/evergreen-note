import React from 'react'
import { UnitCrumbs } from '../../interfaces/unit'
import { useAddons } from '../../hooks/useAddons'
import { cls, colorBase, preset, px } from '../../styles'
import { isEmpty } from '../../utils/isEmpty'
import { mkid } from '../../utils/string/mkid'
import { useApp } from '@/slate-item/hooks/useApp'
import { keyState } from '@/slate-item/addons/KeyClick/helper'

const itemWrapStyle = cls`display: inline-flex; align-items: flex-end;`

const itemStyle = cls`
  max-width: 200px;
  display: inline-block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`

const slashStyle = cls`
  color: var(--cl-slate-300);
  padding-left: ${px(4)};
  padding-right: ${px(4)};
`

/**
 * 面包屑组件
 * @param props
 * @returns
 */
export function CrumbsComp(props: { crumbs?: UnitCrumbs; truncate?: boolean }) {
  const { crumbs, truncate = false } = props
  const { router } = useAddons()
  const app = useApp();

  return isEmpty(crumbs) ? null : (
    <div className="crumbs-outer">
      {crumbs?.map((c) => (
        <span key={mkid()} item-ky={c.ky} className={itemWrapStyle}>
          <a
            className={`${cls`${preset.link.slate};`} ${
              truncate ? itemStyle : ''
            } crumbs-item`}
            onClick={(e) => {
              router.to(c, {}, e.target as HTMLElement)
            }}
          >
            {c.text}
          </a>
          <span className={` ${slashStyle} crumbs-divider`}>/</span>
        </span>
      ))}
    </div>
  )
}
