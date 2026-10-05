import { useAddons } from '../../hooks/useAddons';
import { useIsTop } from '../../hooks/useIsTop';
import { useItem } from '../../hooks/useItem';
import { Item } from '../../interfaces/item';
import { ElementComponentProps } from './EditorView';

// Slate 的内置的 renderElement() 没有 item 参数,
// 这不便利其他插件做一些扩展, 所以这个组件就是给 renderElement 提供 item 参数
export function ElementWrapper(props: ElementComponentProps<any>) {
  const { element } = props;
  const item = useItem();
  const isTopItem = useIsTop(item);
  const isTopPart = useIsTop();
  const isTop = element.type === Item.partTypes.outer ? isTopItem : isTopPart;
  const { editorView } = useAddons();
  return editorView.renderElement({
    ...props,
    item,
    isTop,
  });
}
