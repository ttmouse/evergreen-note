import React from 'react'
import { observer } from 'mobx-react'
import { MagnifyingGlassIcon, XIcon, PuzzlePieceIcon } from '@phosphor-icons/react'
import { useAddons } from '../../hooks/useAddons'
import { $t } from '../../../i18n'
import { AddonDetailComp } from './AddonDetailComp'
import { WordHighlight } from '../../components/WordHighlight/WordHighlight'
import { selectAddonList, type AddonFilter } from './selectAddonList'
import './addon-center.css'

export type AddonInfo = {
  addonName: string
  title: string
  isCore?: boolean
  hidden?: boolean
  quote?: string
  author?: string
  updated?: number
  manual?: string
}

export const AddonCenterComp = observer(function AddonCenterComp() {
  const $ = useAddons()
  const [keyword, setKeyword] = React.useState('')
  const [filter, setFilter] = React.useState<AddonFilter>('all')
  const [detail, setDetail] = React.useState<AddonInfo | null>(null)
  const [, updateStatus] = React.useReducer((value: number) => value + 1, 0)
  const detailRef = React.useRef<HTMLDivElement>(null)
  const searchRef = React.useRef<HTMLInputElement>(null)
  const body = $.addonCenter.getVisibleList() as AddonInfo[]
  const list = selectAddonList(body, keyword, filter, name => $.addonCenter.isAddonEnabled(name))
  const filters: [AddonFilter, string][] = [
    ['all', $t`common.all`], ['enabled', $t`common.enabled`],
    ['disabled', $t`common.disabled`], ['updated', $t`common.updated`],
  ]

  React.useEffect(() => {
    $.addonCenter.isDialogOpen = true
    return () => { $.addonCenter.isDialogOpen = false }
  }, [$])

  React.useEffect(() => { detailRef.current?.scrollTo(0, 0) }, [detail?.addonName])

  return (
    <div className="addon-center-wrap">
      <aside className="addon-list" aria-label={$t`addonCenter.title`}>
        <div className="addon-search-wrap">
          <MagnifyingGlassIcon size={16} aria-hidden="true" />
          <input
            ref={searchRef}
            autoFocus
            type="text"
            aria-label={$t`addonCenter.search`}
            placeholder={$t`addonCenter.search`}
            value={keyword}
            onChange={event => setKeyword(event.target.value)}
          />
          {keyword && <button type="button" aria-label={$t`addonCenter.clear_search`} onClick={() => {
            setKeyword(''); searchRef.current?.focus()
          }}><XIcon size={14} /></button>}
        </div>
        <div className="addon-filters" aria-label={$t`addonCenter.filter`}>
          {filters.map(([value, label]) => (
            <button type="button" key={value} aria-pressed={filter === value}
              onClick={() => setFilter(value)}>{label}</button>
          ))}
        </div>
        <p className="addon-count" role="status">{$t('addonCenter.found', { count: list.length })}</p>
        <div className="addon-results">
          {list.length === 0 ? <div className="addon-no-results">
            <p>{$t`addonCenter.no_results`}</p>
            <span>{$t`addonCenter.search_hint`}</span>
          </div> : list.map(info => (
            <button type="button" className="addon-row" key={info.addonName}
              aria-pressed={detail?.addonName === info.addonName} onClick={() => setDetail(info)}>
              <span className="addon-row-heading">
                <span className="addon-row-title"><WordHighlight content={info.title} keyword={keyword.trim()} /></span>
                {$.addonCenter.isAddonEnabled(info.addonName) && <span className="addon-status">{$t`common.enabled`}</span>}
              </span>
              <span className="addon-row-quote"><WordHighlight content={info.quote ?? ''} keyword={keyword.trim()} /></span>
            </button>
          ))}
        </div>
      </aside>
      <div className="addon-detail-pane" ref={detailRef}>
        {detail ? <AddonDetailComp addonInfo={detail} onStatusChange={updateStatus} /> : (
          <div className="addon-welcome">
            <PuzzlePieceIcon size={32} weight="light" aria-hidden="true" />
            <h2>{$t`addonCenter.title`}</h2>
            <p>{$t`addonCenter.select_hint`}</p>
          </div>
        )}
      </div>
    </div>
  )
})
