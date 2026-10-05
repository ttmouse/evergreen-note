/* eslint-disable react-hooks/exhaustive-deps */
import React from 'react';
import { useAddons } from '../../hooks/useAddons';
import { getSorterFilterLabel, ReferenceComp, SorterAndFilter,  } from './LinkedReferenceComp';
import { isDate } from '../../utils/regexp';
import { useEditorProps } from '../EditorView/useEditorProps';
import { isEmpty } from '../../utils/isEmpty';
import uniqBy from 'lodash/uniqBy';
import { $t } from '../../../i18n';
import { Item } from '../../interfaces/item';
import { useIsReferContext } from '@/slate-item/hooks/useIsReferContext';
import { Orderby } from '../Sorter/Sorter';

/**
 * Unlinked References
 * @param props
 * @returns
 */
export function UnlinkedReferenceComp(props: { item: UnitPersist }) {
  const $ = useAddons();
  const { item } = props;
  const editorProps = useEditorProps();
  const isReferContext = useIsReferContext()
  // 在 Daily Note 中不显示 Unlinked References
  if (
    isReferContext ||
    isDate(item.topic!) ||
    !editorProps.backlink ||
    (isEmpty(item.topic) && !$.topic.isExist(Item.headString(item)))
  ) {
    return null;
  }

  const [list, setList] = React.useState<UnitPersist[] | undefined>(undefined)
  const [filter, setFilter] = React.useState('')
  const [orderBy, setOrderBy] = React.useState<Orderby | undefined>(undefined)
  const [groupBy, setGroupBy] = React.useState<string>('topic')
  const [layout, setLayout] = React.useState<string | undefined>('result')
  const [refreshNum, setRefreshNum] = React.useState(0)
  const [activated, setActivated] = React.useState(false)

  const ref = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (refreshNum == 0) {
      ref.current?.addEventListener(
        'mouseover',
        () => {
          let list = uniqBy(
            $.backlink.getUnlinkedItems(item.ky),
            (one) => one.ky
          );
          setList(list);
        },
        { once: true }
      );
    } else {
      let list = uniqBy(
        $.backlink.getUnlinkedItems(item.ky),
        (one) => one.ky
      );
      setList(list);
    }
  }, [refreshNum]);
  
  const backItem = React.useMemo(() => {
    let lst = list;
    if (lst === undefined) {
      return $.backlink.makeElement({
        subitems: [],
        title: $t('backlink.unlinked_references', { count: '?' } as any) as any,
        foldup: true,
        ky: `${item.ky}-linked`,
      });
    }
    if (filter) {
      const logic = $.traits.createLogic(filter);
      lst = lst.filter(e => logic.exec(e));
    }
    $.sorter.sortItems(lst, false, orderBy || ['updated', 'desc'])
    const extraLabel = getSorterFilterLabel(filter, orderBy)
    const theItem = $.backlink.makeElement({
      subitems: lst,
      title: $t('backlink.unlinked_references', { count: lst.length }) + extraLabel,
      foldup: !activated,
      ky: `${item.ky}-unlinked`,
      groupBy,
      layout
    })
    setActivated(true)
    return theItem
  }, [list, filter, orderBy, groupBy, layout]);

  return (
    <>
      <SorterAndFilter
        filter={filter}
        groupBy={groupBy}
        setFilter={setFilter}
        setOrderBy={setOrderBy}
        setGroupBy={setGroupBy}
        setLayout={setLayout}
        refresh={()=>{setRefreshNum(refreshNum+1)}}
        ky={item.ky+"-unlinked-sorter-filter"}
      />
      <ReferenceComp
        ref={ref}
        itemContainer={backItem}
        className="unlinked-ref"
      />
    </>
  );
}
