import React from 'react'
import { IconList } from '../../components/IconList'
import { atLater } from '../../utils/atLater'
import { isEmpty } from '../../utils/isEmpty'
import { ItemDOM } from '../../components/ItemView'
import { usePubState } from '../../hooks/usePubState'
import { useAddons } from '../../hooks/useAddons'
import { PUB_KEY_MOBILEBAR } from './MobileEditBar'
import { browser } from '@/slate-item/utils/browser'
import { useTopZIndex } from '@/slate-item/hooks/useTopZIndex'

export type MobileBarProps = {}

export function MobileEditBarComp() {
  const ref = React.useRef<HTMLDivElement>(null)
  const { mobileEditBar, prefer } = useAddons()
  const [, setCtx] = usePubState<any>(PUB_KEY_MOBILEBAR, null)

  React.useEffect(() => {
    setCtx({ ref: ref.current })
    const refresh = () => {
      setCtx({ ref: ref.current })
      atLater(
        () => {
          if (!ref.current) {
            return
          }
          const sel = window.getSelection()
          if (sel?.anchorNode?.parentElement?.matches('.node[data-ky] *')) {
            const $itemdom = sel.anchorNode.parentElement.closest(
              '.node'
            ) as ItemDOM;
            const { $item, $editor } = $itemdom;
            setCtx({ item: $item, editor: $editor, ref: ref.current, itemdom: $itemdom })
          }
        },
        'mobilebar',
        150
      )
    };
    document.addEventListener('selectionchange', refresh)
  }, [setCtx])

  const items = Object.values(mobileEditBar.items)

  const styles = ({
    display: 'none',
    position: 'fixed',
    width: '100vw',
    height: '40px',
    left: '0px',
    background: 'white',
    borderRadius: '4px',
    backgroundColor: 'var(--body-bg-color)',
    boxShadow: '0 1px 1px 1.2px var(--cl-slate-300)',
    overflowX: 'scroll',
    overflowY: 'hidden',
  }) as any;

  styles.bottom = '0';

  useTopZIndex(ref);

  return isEmpty(items) ? null : (
    <div
      id={mobileEditBar.mobileEditBarID}
      style={styles}
      ref={ref}
    >
      <IconList body={items} />
    </div>
  )
}
