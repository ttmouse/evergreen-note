/* eslint-disable react-hooks/exhaustive-deps */
import React from 'react'
import { $t } from '../../../i18n'
import { useAddons } from '../../hooks/useAddons'
import { Keyword } from '../../notekit-ui/styled'
import { usePubState } from '../../hooks/usePubState'
import { countKey } from './SrsDeckStartIcon'
import { Tip } from '../../components/Tip/Tip'
import { Icon } from '../../../components/MaterialIcon'
import { cls } from '../../styles'
import { observer } from 'mobx-react'
import { SvgIcon } from '@/components/SvgIcon'

const style = cls`
  display: flex;
  justify-content: space-between;
  align-items: center;
  min-width: 100%;

  .svg-icon path {
    stroke: var(--cl-orange-500) !important;
  }

  &:hover {
    .svg-icon {
      opacity: 1;
    }
  }
`

export const NavTitle = observer(() => {
  const $ = useAddons()
  const [count, setCount] = usePubState(countKey($.srs.SRS_KY), 0)

  const onMouseDown = (e: React.MouseEvent) => {
    e.stopPropagation()
    $.srs.showReviewDialogOf()
  }

  React.useEffect(() => {
    setTimeout(() => {
      setCount(Object.values($.srs.getIndexedItems()).length)
    }, 2000)
  }, [])

  return (
    <div className={['node-text', style].join(' ')}>
      <span>{$t`srs.nav_title`}</span>
      {count > 0 && (
        // <Tip title={$t(`srs.tip_start_review`, { count })}>
        //   <Keyword
        //     color="slate"
        //     depth={100}
        //     hoverDepth={300}
        //     onMouseDown={onMouseDown}
        //   >
        //     {/* {count} */}
        //     <SvgIcon name="svg_dot" width={18} height={18} />
        //   </Keyword>
        // </Tip>
        <SvgIcon name="svg_dot" width={18} height={18} />
      )}
    </div>
  )
})
