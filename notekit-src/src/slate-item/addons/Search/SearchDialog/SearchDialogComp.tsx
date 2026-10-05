/* eslint-disable react/destructuring-assignment */
/* eslint-disable @typescript-eslint/no-use-before-define */
import React, { BaseSyntheticEvent } from 'react'
import { cls, colorBase } from '../../../styles'
import { useAddons } from '../../../hooks/useAddons'
import { Item } from '../../../interfaces/item'
import { isEmpty } from '../../../utils/isEmpty'
import { CrumbsComp } from '../../../components/Crumbs/CrumbsComp'
import { WordHighlight } from '../../../components/WordHighlight/WordHighlight'
import { useSelect } from '../../../hooks/useArrowSelect'
import { $t } from '../../../../i18n'
import throttle from 'lodash/fp/throttle'
import { ScrollLoad2 } from '../../../notekit-ui/components/ScrollLoad/ScrollLoad'
import { Tip } from '@/slate-item/components/Tip/Tip'

const inputStyle = [
  cls`
    position: absolute;
    left: 0px;
    top: 0px;
    width: 100%;

    input {
      padding: 8px;
      height: 52px;
      font-size: 18px;
      display: block;
      width: 100%;
      padding-left: 16px;

      &:focus {
        outline: none;
      }
    }
  `,
  'input-wrap',
  'node-head',
]

export type SearchDialogProps = {
  keyword: string
  allowEmptyKeyword?: boolean
  placeholder?: string
  fetchList: (keyword: string) => UnitPersist[]
  onChoose: (params: {
    item: UnitPersist
    index: number
    list: UnitPersist[]
  }) => void
}

export function CustomItem(props: { keyword: string; caption: string }) {
  const { keyword, caption } = props
  return (
    <span>
      <b className={cls`color: ${[colorBase.blue, 800]}`}>{caption}</b>{' '}
      {keyword}
    </span>
  )
}

export function SearchDialogComp(props: SearchDialogProps) {
  const { keyword, placeholder = $t`searchDialog.quote` } = props
  const ref = React.useRef<HTMLInputElement>(null)
  const [kw, setKw] = React.useState(keyword)

  const $ = useAddons()
  React.useEffect(() => {
    ref.current?.select()
    return () => {
      if (!isEmpty(kw)) {
        $.searchDialog.saveKeyword(kw)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const setKeyword = React.useCallback(throttle(300, setKw), [])
  React.useEffect(() => () => setKeyword.cancel(), [setKeyword])

  const onChange = (e: BaseSyntheticEvent<KeyboardEvent>) => {
    const el = e.target as HTMLInputElement
    if(e.nativeEvent.isComposing || e.nativeEvent.keyCode === 229) return;
    setKeyword(el.value)
  }
  const onKeyDown = (e: React.KeyboardEvent) => {
    const el = e.target as HTMLInputElement
    if (e.key.toLowerCase() === 'escape') {
      $.searchDialog.close()
    } else if (e.key.toLowerCase() === 'backspace') {
      if (el.value.length === 0) {
        if (e.nativeEvent.isComposing || e.nativeEvent.keyCode === 229) return;
        e.preventDefault()
        $.searchDialog.close()
      }
    }
  }
  const onCompositionEnd = (e: React.CompositionEvent) => {
    const el = e.target as HTMLInputElement
    setKeyword(el.value)
  }

  React.useEffect(() => {
    ref.current!.value = keyword
  }, [keyword])

  React.useEffect(() => {
    // move the caret to the end
    const el = ref.current
    if (el) {
      setTimeout(() => {
        const len = el.value.length
        el.focus()
        el.setSelectionRange(len, len)
      }, 10)
    }
  }, [])

  return (
    <div className="node SearchDialog" role="search">
      <div className={inputStyle.join(' ')}>
        <input
          autoComplete='off'
          onKeyDown={onKeyDown}
          onChange={onChange}
          onCompositionEnd={onCompositionEnd}
          defaultValue={keyword}
          ref={ref}
          type="text"
          id={"search-dialog-input"}
          placeholder={placeholder}
          aria-describedby="search-dialog-help"
          aria-controls="search-dialog-results"
        />
      </div>
      <SearchResultWrap {...props} keyword={kw} />
      <div className="search-keyboard-help" id="search-dialog-help">{$t`searchDialog.keyboard_help`}</div>
    </div>
  )
}

const resultStyle = [
  cls`
    margin-top: 80px;
    margin-bottom: 12px;
  `,
  'node-body',
  'search-results-scroll',
]

export function SearchResultWrap(props: SearchDialogProps) {
  const { keyword, fetchList, onChoose, allowEmptyKeyword = false } = props
  const { sorter } = useAddons()
  const list: UnitPersist[] = React.useMemo(() => {
    if (!isEmpty(keyword) || allowEmptyKeyword) {
      const result = fetchList(keyword)
      return result
    }
    return [] as any
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keyword])
  const bodyRef = React.useRef<HTMLDivElement>(null)
  const noteCount = list.filter(item => item.ky !== 'create-topic').length
  useSelect({
    length: list.length,
    bodyRef,
    itemSelector: '.node',
    scrollSelector: '.search-results-scroll',
    defaultIndex: (list && list.length > 0 && list[0].ky == "create-topic") ? 0 : -1,
    deps: [keyword],
    onChoose(index) {
      const item = list[index]
      if ((item as any).onChoose) {
        ;(item as any).onChoose({ item, index, list })
        return
      }
      onChoose({ item, index, list })
    },
  })

  const ResultItem = (p: { item: UnitPersist }) => {
    return <SearchResultItem key={p.item.ky} {...props} item={p.item} />
  }

  return (
    <div className={resultStyle.join(' ')} ref={bodyRef}>
      <div className="search-feedback" role="status" aria-live="polite">
        {isEmpty(keyword) && !allowEmptyKeyword
          ? $t`searchDialog.empty_prompt`
          : noteCount === 0
            ? $t`searchDialog.no_data`
            : $t('searchDialog.results_count', { count: noteCount })}
      </div>
      <div className="node-subitems" id="search-dialog-results">
        {!isEmpty(list) && (
          <ScrollLoad2 list={list} staticCount={15} renderItem={ResultItem} />
        )}
      </div>
    </div>
  )
}

const resultItemStyle = [
  cls`
    padding: 8px;
    border-top: 1px solid var(--cl-slate-100);
    cursor: pointer;
    border-radius: 4px;

    &:hover {
      outline: 1px solid var(--cl-slate-300);
    }
    &.active {
      background: var(--cl-slate-200);
    }

    > .node-head {
      padding: 4px 0px;
    }

    .crumbs-item {
      font-size: 12px !important;
      color: var(--cl-slate-400) !important;
    }
  `,
  '.node',
  'search-result-item',
]

export function SearchResultItem(
  props: SearchDialogProps & {
    item: UnitPersist
  }
) {
  const { item, keyword, onChoose } = props
  const $ = useAddons()
  const crumbs = $.crumbs.getCrumbs(item)
  const onClick = () => {
    // $.searchDialog.handleChoose(item);
    if ((item as any).onChoose) {
      ;(item as any).onChoose({ item } as any)
    } else {
      onChoose({ item } as any)
    }
  }
  const cssClass = [...resultItemStyle, 'node']

  const count = $.refer.getBacklinkCount(item.ky) + $.embed.getBacklinkCount(item.ky)

  return (
    <div className={cssClass.join(' ')} onClick={onClick}>
      <div
        className="node-head"
        style={{ display: 'flex', justifyContent: 'space-between' }}
      >
        {(item as any).headString ?? (
          <WordHighlight
            content={Item.headString(item, { parseRefer: true })}
            keyword={keyword}
          />
        )}
        {count > 0 && (
          <Tip title={`References: ${count}`}>
            <span>{count}</span>
          </Tip>
        )}
      </div>
      <CrumbsComp truncate crumbs={crumbs} />
    </div>
  )
}
