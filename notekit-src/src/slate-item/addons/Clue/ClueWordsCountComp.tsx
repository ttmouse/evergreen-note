import React from 'react';
import { useItem } from '../../hooks/useItem';
import { useAddons } from '../../hooks/useAddons';
import { cls } from '../../styles';
import { useIsTop } from '../../hooks/useIsTop';
import { $t } from '../../../i18n';
import { useEditor } from '../../hooks/useEditor';
import { ItemTransforms } from '../../transforms/item';
import { Tip } from '../../components/Tip/Tip';

export type ClueWordCountProps = {};

const style = cls`
  font-size: 10px;
  cursor: pointer;
  border-radius: 4px;
  padding: 0px 2px;

  &:hover {
    outline: 1px solid var(--cl-slate-200);
  }
`;

export function ClueWordCountComp() {
  const item = useItem();
  const $ = useAddons();
  const isTop = useIsTop(item);
  if (!item.foldup || item.$isTmp || isTop) {
    return null;
  }
  const count = $.counter.countWordsOfTree(item).count;
  if (count < 1) {
    return null;
  }
  return (
    <Tip title={$t`common.expand`}>
      <span onClick={() => item.DoFoldup(false)} className={[style, 'clue-word-count'].join(' ')}>
        {$t(`clue.words_count`, { count })}
      </span>
    </Tip>
  );
}
