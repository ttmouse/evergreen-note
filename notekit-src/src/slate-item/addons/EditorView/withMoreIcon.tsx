import React from 'react';
import { icons } from '../../../components/SvgIcon';
import { IconItem, setSubVisible } from '../../components';
import { useIsReferContext } from '../../hooks/useIsReferContext';
import { useIsTop } from '../../hooks/useIsTop';
import { useItem } from '../../hooks/useItem';
import { pub } from '../../utils/pub';
import { mkid } from '../../utils/string/mkid';
import { FeatureItem } from './EditorView';
import { obj2list } from './helper';
import { useLang } from '../../hooks/useLang';
import { useEditor } from '../../hooks/useEditor';
import { $t } from '../../../i18n';

export function withMoreIcon(moreItems: { [k: string]: FeatureItem }) {
  return function MoreIcon() {
    const isTop = useIsTop();
    const isReferCxt = useIsReferContext();
    const item = useItem();
    if (!isTop || isReferCxt || item.$isTmp) {
      return null;
    }
    const langs = useLang();
    const editor = useEditor();

    const [id] = React.useState(() => `more-subitems-${mkid()}`);
    const [subitems] = React.useState<any>(() => {
      return obj2list(moreItems, (props, k) => {
        if (props.subitems) {
          return {
            id: k,
            ...props,
          }
        }
        props.handleClick ??= props.onClick;
        const onClick = (e: React.MouseEvent) => {
          props.handleClick(e, { item, editor });
          setSubVisible(id, false);
        };
        return {
          id: k,
          ...props,
          onClick,
        };
      });
    });

    return (
      <IconItem
        id={id}
        order={5000}
        icon={icons.svg_more}
        title={$t`common.more`}
        size={20}
        subitems={subitems}
        dropdownHorizontal="left"
        dropdownVertical="bottom"
      />
    );
  };
}
