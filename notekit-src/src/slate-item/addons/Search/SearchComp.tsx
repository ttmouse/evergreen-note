/* eslint-disable react-hooks/exhaustive-deps */
import React from 'react'
import { useAddons } from '../../hooks/useAddons'
import { useEditor } from '../../hooks/useEditor'
import { useItem } from '../../hooks/useItem'
import { Item } from '../../interfaces/item'
import { ElementComponentProps } from '../EditorView/EditorView'
import { ContextEditorReference } from '../Embed/EmbedContexts'
import { InlineOuterComp } from '../Inlines/InlineOuterComp'
import { SearchInputComp } from './SearchInputComp'
import { isEmpty, notEmpty } from '../../utils/isEmpty'
import { mkid } from '../../utils/string/mkid'
import './search.less'
import { useEditorProps } from '../EditorView/useEditorProps'
import { SearchElement, SearchNeededProps } from './Search'
import { InlineElement } from '../Inlines/Inlines'
import { useAwait } from '../../hooks/useAwait'
import { ContextKeywords } from './SearchContexts'
import { setPubState } from '../../hooks/usePubState'
import { useCheckBadRecur } from '../../components/ItemView/ItemViewContexts'
import { getSorterFilterLabel, SorterAndFilter } from '../Backlink/LinkedReferenceComp'
import { Orderby } from '../Sorter/Sorter'

export function SearchResultComp(
  props: SearchNeededProps & { title?: string; items?: UnitPersist[] }
) {
  const { value, limit = 100, items } = props
  const { editorView, search } = useAddons()
  const { readOnly } = useEditorProps()
  const $ = useAddons()
  const editor = useEditor()
  const item = useItem()
  const [refreshNum, setRefreshNum] = React.useState(0)

  const [list, setList] = React.useState<UnitPersist[]>([])

  useAwait(async () => {
    const theList =
      items ??
      (await search.findAllAsync(value, {
        limit,
        isRecur: true,
        foldupEach: true,
      }, true))
    setList(theList)
  }, [value, limit, items, refreshNum])

  const isBadRecur = useCheckBadRecur(item.ky)
  if (isBadRecur) {
    console.error('Bad recur occur in search component: ', item.ky)
    // return null;
  }

  let c: string | number = list.length
  if (c >= limit) {
    c = `${c}+`
  }
  const id = mkid()
  const [orderBy, setOrderBy] = React.useState<Orderby | undefined>(props.orderby ?? undefined)
  const [filter, setFilter] = React.useState<string | undefined>(undefined)
  const [groupBy, setGroupBy] = React.useState<string>(props.groupby ?? 'none')
  const [layout, setLayout] = React.useState<string | undefined>(props.layout ?? 'result-nogroup')
  const createSetPropsWithSave = (key: string, oriFunc: (val: any) => any) => {
    return (e: any) => {
      oriFunc(e);
      if(props.iky) $.inlines.setProps(editor, item.GetSlPath(), {
        [key]: e,
        iky: props.iky,
      } as any)
    }
  }
  const setOrderByWithSave = createSetPropsWithSave('orderby', setOrderBy)
  const setGroupByWithSave = createSetPropsWithSave('groupby', setGroupBy)
  const setLayoutWithSave = createSetPropsWithSave('layout', setLayout)
  const tmpItem = React.useMemo(() => {
    let od = orderBy
    if (od === undefined) {
      if(/is:(task|todo)/.test(value)) {
        od = ['$reminder', 'asc']
      }
      if (/(event|事件)/.test(value)) {
        od = ['$reminder', 'desc']
      }
    }
    let listSorted = od ? $.sorter.sortItems(list, true, od) : list
    if(filter) {
      const logic = $.traits.createLogic(filter);
      listSorted = listSorted.filter(e => logic.exec(e));
    }
    const extraTitle = getSorterFilterLabel(filter, orderBy)
    const { title = `${notEmpty(extraTitle) ? listSorted.length : c} items found for "${value}"` } = props
    const layoutUsed = layout ?? 'result'
    const item = {
      ky: id,
      $crumbsContext: 'search',
      $isTmp: true,
      ori: title + extraTitle,
      layout: layoutUsed,
      icon: 'svg_arrow_down',
    } as any
    item.subitems = $.grouphelper.getGroupFunc(groupBy)(listSorted, {
      parentLayout: layoutUsed
    })
    return Item.newItem({
      layout: 'result-container',
      ori: '',
      subitems: [
        item,
      ],
    })
  }, [list, orderBy, filter, groupBy, layout])

  const EditorComponent = editorView.createComponent()
  return (
    <>
      <SorterAndFilter
        ky={id+"-sorter-filter"}
        setOrderBy={setOrderByWithSave}
        filter={filter}
        groupBy={groupBy}
        setFilter={setFilter}
        setGroupBy={setGroupByWithSave}
        setLayout={setLayoutWithSave}
        refresh={() => { setRefreshNum(refreshNum + 1) }}
      />
      <EditorComponent
        classEditable={['search-result-editor', 'node-foldable']}
        item={tmpItem}
        readOnly={readOnly}
        highlightKeywords={[value]}
      />
    </>
  )
}

export function useHandleInputChange(
  props: ElementComponentProps<SearchElement>
) {
  const item = useItem()
  const editor = useEditor()
  const { inlines } = useAddons()
  const { element } = props
  const { iky }: InlineElement = element as any
  const onChange = React.useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      inlines.setProps(editor, item.GetSlPath(), {
        value: e.target.value,
        iky,
      } as any)
    },
    []
  )
  return onChange
}

export function SearchElementComp(props: ElementComponentProps<SearchElement>) {
  const { element } = props
  const { value, groupby, orderby, layout }: SearchNeededProps = element as any
  const onChange = useHandleInputChange(props)
  const inner = React.useMemo(() => {
    setPubState('globalKeywords', [value])
    return (
      <ContextKeywords.Provider value={[value]}>
        <SearchInputComp value={value} onChange={onChange} />
        {isEmpty(value) ? null : <SearchResultComp value={value} groupby={groupby} orderby={orderby} layout={layout} iky={element.iky} />}
      </ContextKeywords.Provider>
    )
  }, [value])
  return (
    <ContextEditorReference.Provider value>
      <InlineOuterComp cssInlineBlock inner={inner} {...props} />
    </ContextEditorReference.Provider>
  )
}
