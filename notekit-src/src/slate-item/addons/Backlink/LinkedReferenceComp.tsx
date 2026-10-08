/* eslint-disable react-hooks/exhaustive-deps */
/* eslint-disable @typescript-eslint/no-use-before-define */
import React from 'react'
import { useAddons } from '../../hooks/useAddons'
import { useIsReferContext } from '../../hooks/useIsReferContext'
import { cls } from '../../styles/atom'
import { useEditorProps } from '../EditorView/useEditorProps'
import { ContextBacklink } from './BacklinkContexts'
import uniqBy from 'lodash/uniqBy'
import { $t } from '../../../i18n'
import { LoadedAddons } from '../../../main'
import { buildTree } from '../Trash/helper'
import { ScrollLoad2 } from '../../notekit-ui/components/ScrollLoad/ScrollLoad'
import { PartExtra } from '@/slate-item/components/UnitView/Parts'
import { FormSubitems } from '../Form/Form'
import { Orderby } from '../Sorter/Sorter'
import { UnitProps } from '@/slate-item/interfaces/unit'
import { obj2list } from '../EditorView/helper'
import { observer } from 'mobx-react'
import { nodeString } from '../../utils/string/nodeString'

const cssStyle = cls`
  label: reference-component;

  &:last-child {
    padding-bottom: 100px;
  }

  .node-top  > .node-body {
    margin-top: 0px !important;
  }
`

export type ReferenceProps = {
  itemContainer: UnitPersist
  className?: string
}

export const ReferenceComp = React.forwardRef(
  (props: ReferenceProps, ref: any) => {
    const { itemContainer, className = '' } = props
    const { editorView } = useAddons()
    // const topItem = React.useContext(ContextTopItem);
    const ctxBacklink = React.useContext(ContextBacklink)
    const isReferContext = useIsReferContext()

    // prevent endless recursion
    if (ctxBacklink || isReferContext) {
      return null
    }

    const EditorComponent = editorView.createComponent()

    return (
      <ContextBacklink.Provider value>
        <div ref={ref} className={[cssStyle, 'backlinks', className].join(' ')}>
          <EditorComponent item={itemContainer} />
          {/* <ScrollLoad2
            list={itemContainer.subitems as UnitPersist[]}
            renderItem={EditorComponent}
          /> */}
        </div>
      </ContextBacklink.Provider>
    )
  }
)

export type UseReferenceParams = {
  item: UnitPersist
  getList: (item: UnitPersist, addons: LoadedAddons) => UnitPersist[]
  type: string // 'linked' | 'unlinked' | 'created' | ...
  i18nTitle: string
  count?: (item: UnitPersist, addons: LoadedAddons) => number
  foldupTopics?: boolean
  foldup?: boolean
  groupBy?: string
  filter?: string
  orderBy?: Orderby
  layout?: string
  refreshNum?: number
}

export function useReference(params: UseReferenceParams) {
  const $ = useAddons()
  const editorProps = useEditorProps()
  const { item, getList, type, i18nTitle, count, foldupTopics, foldup, groupBy, filter, layout, refreshNum } = params

  return React.useMemo(() => {
    if (!editorProps.backlink) {
      return [null, null] as any
    }
    let items = buildTree(uniqBy(getList(item, $), (one) => one.ky))
    
    let orderBy = params.orderBy
    if (!orderBy) {
      if (params.type === "remind") {
        orderBy = ['$reminder', 'asc', item.ky]
      } else {
        orderBy = ['updated', 'desc']
      }
    }

    if (filter) {
      const logic = $.traits.createLogic(filter);
      items = items.filter(e => logic.exec(e));
    }

    $.sorter.sortItems(items, false, orderBy)

    const theItem = $.backlink.makeElement({
      title: $t(i18nTitle, { count: count ? count(item, $) : items.length }) + getSorterFilterLabel(filter, params.orderBy),
      subitems: items,
      ky: `${item.ky}-${type}`,
      foldupSome: [item.ky],
      foldupTopics,
      foldup,
      groupBy,
      layout
    })
    return [theItem, items]
  }, [item.ky, filter, params.orderBy, groupBy, layout, refreshNum])
}

export function getSorterFilterLabel(filter: string | undefined, orderBy: Orderby | undefined): string {
  return (filter ? ` filtered with ${filter}` : '') + (orderBy ? ` sorted by ${orderBy[0]
    .replace(/^\$/, '')
    .replace(/([A-Z])/g, ' $1')
    .toLocaleLowerCase()}${orderBy[2] ? '('+orderBy[2]+')' : ''} ${orderBy[1] === 'asc' ? '↑' : '↓'}` : '');
}

function CreateShowSmallFormDialog(
  $: LoadedAddons,
  subitems: FormSubitems<any>,
  initialValues: any,
  buttons: any
) {
  return (e: React.MouseEvent) => {
    $.form.popup({
      initialValues,
      subitems,
      buttons,
      SnapProps: {
        place: ['center', 'bottom-out'],
        targetBox: {
          left: e.clientX,
          top: e.clientY,
          width: 0,
          height: 0
        },
      },
    })
  }
}

export function SorterAndFilter(props: {
  ky: string,
  filter?: string
  groupBy?: string
  setFilter?: (filter: string) => void
  setOrderBy?: (orderBy: Orderby | undefined) => void
  setGroupBy?: (groupBy: string) => void
  setLayout?: (layout: string | undefined) => void
  refresh?: () => void
}) {
  const $ = useAddons()
  const { ky, filter, groupBy, setFilter, setOrderBy, setGroupBy, setLayout, refresh } = props
  const comps: Partial<UnitProps>[] = [];
  if (refresh) {
    comps.push({
      title: $t`Refresh`,
      icon: 'svg_refresh',
      onClick: () => {
        refresh()
      }
    })
  }
  if (groupBy !== "none" && setLayout) {
    comps.push({
      title: $t`Layout`,
      icon: 'svg_mindmap',
      subitems: [
        {
          title: $t`Default`,
          icon: 'svg_list',
          onClick() {
            setLayout(undefined)
          }
        },
        {
          title: $t`Kanban`,
          icon: 'svg_kanban',
          onClick() {
            setLayout('kanban')
          },
        },
        {
          title: $t`Markdown`,
          icon: 'svg_markdown',
          onClick() {
            setLayout('markdown')
          }
        },
        {
          title: $t`Mindmap`,
          icon: 'svg_mindmap',
          onClick() {
            setLayout('flexmap')
          },
        },
      ]
    })
  }
  if (setGroupBy) {
    comps.push({
      title: $t`Grouping`,
      icon: 'svg_kanban',
      subitems: obj2list($.grouphelper.getGroupModeItems()).map(e=>{
        e.onClick = () => {
          if(e.layout && setLayout) setLayout(e.layout) 
          setGroupBy(e.id!)
        }
        return e
      })
    })
  }
  if (setOrderBy) {
    comps.push({
      title: "Sort",
      icon: 'svg_sort',
      subitems: obj2list($.sorter.getSchemeGetter((k) => {
        setOrderBy(k)
        return;
      })),
    })
  }
  if (setFilter) {
    comps.push({
      title: "Filter",
      icon: 'svg_filter',
      onClick: CreateShowSmallFormDialog($, {
        content: {
          type: 'text',
          title: 'Filter',
          autoFocus: true,
        },
      }, {
        content: filter,
      }, {
        [$t`Clear`]: (e: any) => {
          setFilter('')
        },
        [$t`common.done`]: (e: any) => {
          setFilter(e.content)
        },
      })
    })
  }
  
  return <PartExtra
    id={ky + "-extra"}
    className={['reference-comp-extra']}
    extra={comps}
  />
}

export function withReference(params: Omit<UseReferenceParams, 'item'>) {
  return function Comp(props: { item: UnitPersist }) {
    const editorProps = useEditorProps()
    const isReferContext = useIsReferContext()
    if (isReferContext) return null;

    let { groupBy: paramsGroupBy, layout: paramsLayout, ...rest } = params
    const { item } = props
    const [filter, setFilter] = React.useState('')
    const [orderBy, setOrderBy] = React.useState<Orderby | undefined>(undefined)
    const [groupBy, setGroupBy] = React.useState<string>(paramsGroupBy || 'topic')
    const [layout, setLayout] = React.useState<string | undefined>(paramsLayout || groupBy === 'none' ? 'result-nogroup' : 'result')
    const [refreshNum, setRefreshNum] = React.useState(0)
    const [backItem, list] = useReference({ item, filter, orderBy, groupBy, layout, refreshNum, ...rest })

    if (!editorProps.backlink) {
      return null
    }

    const refresh = () => {
      setRefreshNum(refreshNum + 1)
    }

    return (list.length < 1 && !filter) ? null : (
      <>
        <SorterAndFilter
          ky={backItem.ky+"-sorter-filter"}
          filter={filter}
          groupBy={groupBy}
          setFilter={setFilter}
          setOrderBy={setOrderBy}
          setGroupBy={setGroupBy}
          setLayout={setLayout}
          refresh={refresh}
        />
        <ReferenceComp
          itemContainer={backItem}
          className={`${params.type}-ref`}
        />
      </>
    )
  }
}

/**
 * Linked References
 * @param props
 * @returns
 */
/** Plain text of an item for reading-style excerpts. */
export const readingPlainText = (item: UnitPersist): string =>
  (item.leaves?.length ? nodeString({ children: item.leaves } as any) : item.ori || '')
    .replace(/\[\[([^\]]+)\]\]/g, '$1').trim()

/** Reading previews keep the source and the actual citation together. */
export const LinkedReferenceComp = observer((props: { item: UnitPersist }) => {
  const $ = useAddons()
  const editorProps = useEditorProps()
  const isReferContext = useIsReferContext()
  const ctxBacklink = React.useContext(ContextBacklink)
  // 板块级折叠：点标题行收起/展开整个模块（OP-047 追加，2026-10-08）。
  const [sectionOpen, setSectionOpen] = React.useState(true)
  if (!editorProps.backlink || isReferContext || ctxBacklink) return null

  const citations = uniqBy($.backlink.getLinkedItems(props.item.ky), one => one.ky)
  const groups = new Map<string, { source: UnitPersist; citations: UnitPersist[] }>()
  for (const citation of citations) {
    const source = citation.isTopic ? citation : $.topic.getParentTopicItem(citation)
    if (!source) continue
    const group = groups.get(source.ky) || { source, citations: [] }
    group.citations.push(citation)
    groups.set(source.ky, group)
  }
  if (!groups.size) return null
  const plainText = readingPlainText

  return <section className="backlink-reading" aria-label="链接到这篇笔记">
    <h2 className="backlink-reading-head" onClick={() => setSectionOpen(v => !v)}>
      <span className="backlink-reading-caret" data-open={String(sectionOpen)}>▸</span>
      链接到这篇笔记 <span>{groups.size}</span></h2>
    {sectionOpen && (
    <div className="backlink-reading-grid">
      {Array.from(groups.values()).map(({ source, citations }) => {
        const excerpts = citations.map(citation => {
          const text = plainText(citation)
          const parent = citation.pky ? $.dbMemory.getItem(citation.pky) : null
          const context = parent && parent.ky !== source.ky ? plainText(parent) : ''
          const children = Object.values(citation.subitems || {}) as UnitPersist[]
          return [context, text, ...children.slice(0, 2).map(plainText)]
            .filter(Boolean).join(' — ')
        })
        return <button key={source.ky} className="backlink-reading-entry"
          onClick={e => $.topic.route(source.topic || plainText(source), {}, e.currentTarget)}>
          <span className="backlink-reading-title">{source.topic || plainText(source)}</span>
          <span className="backlink-reading-excerpt">{excerpts.join('\n')}</span>
        </button>
      })}
    </div>
    )}
  </section>
})
