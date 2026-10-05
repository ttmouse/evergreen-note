/* eslint-disable react-hooks/exhaustive-deps */
import React from 'react';
import { SvgIcon } from '../../../components/SvgIcon';
import { isEmpty } from '../../utils/isEmpty';
import { ElementComponentProps } from '../EditorView/EditorView';
import { ContextEditorReference } from '../Embed/EmbedContexts';
import { InlineOuterComp } from '../Inlines/InlineOuterComp';
import { SearchResultComp, useHandleInputChange } from '../Search/SearchComp';
import { SearchInputComp } from '../Search/SearchInputComp';
import { RandomElement } from './Random';
import { appendStyle } from '../../utils/dom/appendStyle';
import { UnitPersist } from '../../interfaces/unit';
import { useAddons } from '../../hooks/useAddons';
import { useItem } from '../../hooks/useItem';
import { showSnack } from '../../utils/msg/showSnack';
import { shuffle } from '../../utils/array/shuffle';
import { useAwait } from '../../hooks/useAwait';

appendStyle(`
  .node.node-with-random {
    align-items: flex-start;
  }
`);

export function RandomIcon() {
  return <SvgIcon name="svg_dice" width={20} height={20} />;
}

export function RandomElementComp(props: ElementComponentProps<RandomElement>) {
  const itemContainer = useItem();
  const { element } = props;
  const { value = '*', iky }: RandomElement = element as any;
  const keyword = isEmpty(value) ? '*' : value;
  const { random, inlines } = useAddons();

  const [items, setItems] = React.useState<UnitPersist[]>([]);

  useAwait(async () => {
    const kw = `${keyword} -ky(${itemContainer.ky})`;
    const list = await random.findAll(kw, {
      limit: 500,
      isRecur: true,
      foldupEach: false,
    });
    setItems(shuffle(list));
  }, [keyword]);

  const [index, setIndex] = React.useState<number>(() => {
    // if (notEmpty<string>(lastKy)) {
    //   return items.findIndex((item) => item.ky === lastKy);
    // }
    return 0;
  });

  const onClickIcon = async () => {
    const nextIndex = index + 1;
    if (nextIndex >= items.length) {
      showSnack('No more items to random');
      return;
    }
    inlines.dbSetProps<RandomElement>(itemContainer.ky, {
      iky,
      lastKy: items[nextIndex].ky,
    });
    setIndex(nextIndex);
  };

  const randomItem = items[index];
  const onChange = useHandleInputChange(props);

  const inner = React.useMemo(() => {
    return (
      <>
        <SearchInputComp
          value={value}
          placeholder="Random condition"
          onChange={onChange}
          icon={<RandomIcon />}
          onClickIcon={onClickIcon}
        />
        <SearchResultComp
          title={`${items.length} items found for "${keyword}"`}
          value={keyword}
          items={randomItem ? [randomItem] : []}
        />
      </>
    );
  }, [value, randomItem?.ky]);
  return (
    <ContextEditorReference.Provider value>
      <InlineOuterComp cssInlineBlock inner={inner} {...props} />
    </ContextEditorReference.Provider>
  );
}
