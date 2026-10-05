import React from 'react';
import { useEditor } from '../../hooks/useEditor';
import { cls, px } from '../../styles';
import { ItemTransforms } from '../../transforms/item';
import { useIsReferContext } from '../../hooks/useIsReferContext';
import { useEditorProps } from './useEditorProps';
import { ContextTopItem } from './EditorViewContexts';
import { ContextDialog } from '../../utils/msg/msgContexts';

const styleClass = cls`
  min-height: ${px(30)};
  margin: 0 ${px(12)};
  transition: 0.3s all;
  opacity: .7;
  color: transparent;
  background-color: transparent;
  transition: 0.3s all;
  cursor: text;
`;

// 点击编辑器底部，添加新行
export function FootNewLineComp() {
  const isReferContext = useIsReferContext();
  const ctxDialog = React.useContext(ContextDialog);
  const editor = useEditor();
  const topItem = React.useContext(ContextTopItem);
  const { readOnly } = useEditorProps();
  if (
    readOnly ||
    isReferContext ||
    ctxDialog ||
    topItem.layout === 'result-container'
  ) {
    return null;
  }
  const onClick = () => {
    ItemTransforms.insertLastItems(editor, { at: [0] });
  };
  return (
    <div
      className={[styleClass, 'click-empty-add'].join(' ')}
      onClick={onClick}
    >
      Add item
    </div>
  );
}
