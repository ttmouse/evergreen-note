import React from 'react';
import { ElementComponentProps } from '../EditorView/EditorView';
import { InlineOuterComp } from '../Inlines/InlineOuterComp';
import { CounterElement } from './Counter';
import { useAddons } from '../../hooks/useAddons';
import { useItem } from '../../hooks/useItem';
import { pub } from '../../utils/pub';
import { atLater } from '../../utils/atLater';
import { cls, colorBase } from '../../styles';
import { isEmpty } from '../../utils/isEmpty';
import { mkid } from '@/slate-item/utils/string/mkid';

const styleClass = [
  cls`
    margin: 0px 4px;
    display: inline-block;
    padding: 4px 6px;
    border-radius: 100px;
    font-size: 12px;
    line-height: 100%;
    background-color: var(--cl-slate-500);
    color: #fff;
    cursor: pointer;
  `,
  'counter-comp',
];

export function CounterElementComp(
  props: ElementComponentProps<CounterElement>
) {
  const { dbMemory, search, traits } = useAddons();
  const { element } = props;
  const instanceId = mkid();
  const ctxItem = useItem();
  const theRule = React.useRef('');
  const keyword = `under(ky(${ctxItem.ky}))`;

  const getCount = React.useCallback(() => {
    let rule = `parent(ky(${ctxItem.ky}))`;
    if (element.target === 'descendant') {
      rule = `under(ky(${ctxItem.ky}))`;
    } else if (element.target === 'enditems') {
      rule = `under(ky(${ctxItem.ky})) sub(0)`;
    } else if (
      element.target === 'customized' &&
      !isEmpty(element.customized)
    ) {
      rule = element.customized?.replace(
        /\{%self\}/gi,
        `under(ky(${ctxItem.ky}))`
      ) as any;
    }
    theRule.current = rule;
    let items = [] as UnitPersist[];
    if (rule.includes(ctxItem.ky)) {
      items = dbMemory.getItemsByIndex('path', ctxItem.ky);
    } else {
      items = dbMemory.list;
    }
    return search.findAll(rule, {
      items,
      limit: Infinity,
    }).length;
  }, [ctxItem.ky, dbMemory, element.customized, element.target, search]);

  const [val, setVal] = React.useState(getCount);

  React.useEffect(() => {
    const fn = pub.on(pub.evt.itemChanged, ({ originalData, newer }) => {
      const item = newer;
      // if (item.ky === ctxItem.ky) {
      if (traits.match(theRule.current, item) || traits.match(theRule.current, originalData)) {
        atLater(() => setVal(getCount()), `update-counter-${item.ky}-${instanceId}`, 500);
      }
    });

    return () => {
      pub.off(pub.evt.itemChanged, fn);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const inner = (
    <span
      className={styleClass.join(' ')}
      onClick={() => search.showDialog({ keyword })}
    >
      {val}
    </span>
  );
  return <InlineOuterComp inner={inner} {...props} />;
}
