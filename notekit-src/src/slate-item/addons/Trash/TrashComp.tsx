import React from 'react'
import { TrashGroups } from './Trash'
import { Item, KyString, UnitCrumbs, UnitPersist } from '../..'
import { useAddons } from '../../hooks/useAddons'
import { mkid } from '../../utils/string/mkid'
import { EDITOR_INVOKER } from '../EditorView/EditorView'
import { appendStyle } from '../../utils/dom/appendStyle'
import { cls } from '../../styles'
import { useAwait } from '../../hooks/useAwait'
import { datekit, fromNow } from '../../utils/date/datekit'
import { isEmpty } from '../../utils/isEmpty'
import CircularProgress from '@mui/material/CircularProgress'
import { useEditorProps } from '../EditorView/useEditorProps'
import Chip from '@mui/material/Chip'
import { Tip } from '../../components/Tip/Tip'
import { CaretDownIcon } from '@phosphor-icons/react'
import { $t } from '../../../i18n'
import { ScrollLoad2 } from '../../notekit-ui/components/ScrollLoad/ScrollLoad'
import { showSnack } from '../../utils/msg/showSnack'
import { buildTree } from './helper'
import { omit } from '../../utils/object/omit'

appendStyle(cls`
  .trash-group {
    position: relative;

    .group-title {
      color: var(--cl-slate-300);
      font-size: 14px;
    }

    .MuiChip-root {
      opacity: 0;
      transition: 0.3s all;
    }

    &:hover {
      .MuiChip-root {
        opacity: 1;
      }
    }
  }

  .trash-box .node-top:not(.node-top *) > .node-body > .node-subitems > .note-block {
    margin-bottom: 16px;
    transition: 0.3s all;

    .trash-restore-btn {
      opacity: 0;
      transition: 0.3s all;
      order: 1;
    }

    &:hover {
      > .node-head .trash-restore-btn {
        opacity: 1;
      }
    }
  }
`)

function TrashGroupComp(props: { item: UnitPersist }) {
  const $ = useAddons()
  const EditorView = $.editorView.createComponent()
  const { item } = props
  const date = item.ori

  const [block, setBlock] = React.useState<UnitPersist>({
    ...item,
    $crumbsContext: 'trash',
    subitems: buildTree(item.subitems as UnitPersist[]),
  } as any)

  async function getParent(one: UnitPersist) {
    let parentItem = $.dbMemory.getItem(one.pky)
    if (isEmpty(parentItem)) {
      parentItem = (await $.dbDisk.open(await $.libAdmin.getOpenId()).node.get(one.pky)) as UnitPersist
    }
    return parentItem
  }

  async function getCrumbs(one: UnitPersist) {
    const crumbs: UnitCrumbs = []
    let parentItem = await getParent(one)
    while (!isEmpty(parentItem)) {
      crumbs.unshift({
        ky: parentItem.ky,
        text: Item.headString(parentItem),
        isTopic: parentItem.isTopic,
      })
      parentItem = await getParent(parentItem)
    }
    return crumbs
  }

  useAwait(async () => {
    for (const one of block.subitems as UnitPersist[]) {
      const crumbs = await getCrumbs(one)
      one.crumbs = crumbs
    }
    setBlock({
      ...item,
      $crumbsContext: 'trash',
    } as any)
  }, [])

  if (!Array.isArray(item.subitems)) {
    return null
  }

  const count = item.subitems.length
  return (
    <div key={date} className="trash-group">
      <div className="group-title">
        <CaretDownIcon size={12} weight="bold" style={{ verticalAlign: '-1px', marginRight: 4 }} />
        {$t`trash.deleted_at`} {fromNow(date)}
      </div>
      <Tip title={$t('trash.restore_below_items', { count })} placement="left">
        <Chip
          size="small"
          onClick={async (e) => {
            $.trash.recoverItems((item as any)?.subitems ?? [], true)
            const el = e.target as HTMLElement
            el.closest('.trash-group')?.remove()
            showSnack({
              content: `Successfully restored ${count} items`,
              severity: 'success',
            })
          }}
          label={$t`trash.restore`}
          color="primary"
          variant="outlined"
          sx={{
            order: 10000,
            marginRight: 1,
            position: 'absolute',
            right: 5,
            top: 5,
          }}
        />
      </Tip>
      <EditorView
        item={block}
        fromRouter={false}
        invoker={EDITOR_INVOKER.TRASH}
        preventSaving
        autoFocus={false}
        readOnly
        titleVisible={false}
        crumbsVisible
      />
    </div>
  )
}

export function TrashComp() {
  const [list, setList] = React.useState<UnitPersist[] | null>(null)
  const $ = useAddons()

  useAwait(async () => {
    const items = await $.trash.getItems()
    // group by updated
    const groups: { [d: string]: UnitPersist[] } = {}
    for (const item of items) {
      const date = datekit(item.updated).format('YYYY-MM-DD HH:mm')
      groups[date] = groups[date] ?? []
      groups[date].push(item)
    }

    const groupedList: UnitPersist[] = []
    for (const [date, subitems] of Object.entries(groups)) {
      groupedList.push(
        Item.newItem({
          ori: date,
          subitems,
        })
      )
    }
    setList(groupedList)
  }, [])

  return (
    <div className="trash-box">
      {list === null ? (
        <div className="trash-state">
          {$t`common.loading`} <CircularProgress size={14} />
        </div>
      ) : (
        (isEmpty(list) && (
          <div className="trash-state">{$t`trash.trash_is_empty`}</div>
        )) || (
          <ScrollLoad2 renderItem={TrashGroupComp} list={list} />
        )
      )}
    </div>
  )
}
