import React from 'react';
import { ElementComponentProps } from '../../EditorView/EditorView';
import { InlineOuterComp } from '../../Inlines/InlineOuterComp';
import { RatingComp } from './RatingComp';
import { useAddons } from '../../../hooks/useAddons';
import { useItem } from '../../../hooks/useItem';
import { useEditor } from '../../../hooks/useEditor';
import { appendStyle } from '../../../utils/dom/appendStyle';

// 由于插入 Rating 元素之后，在页面中它与普通文本没垂直对齐，所以这里需要修正一下
const fixTop = 5;
appendStyle(`
  .node.node-with-rating {
    align-items: flex-start;
  }
  .node .node-head-with-rating {
    padding-bottom: 0px !important;
  }
  .node-text-with-rating {
    position: relative;
    top: -${fixTop}px;
  }
`);

export function RatingElementComp(props: ElementComponentProps) {
  const { inlines } = useAddons();
  const editor = useEditor();
  const item = useItem();
  const { element } = props;
  const { value, iky } = element;
  const onChange = (e: React.ChangeEvent) => {
    inlines.setProps(editor, item.GetSlPath(), {
      iky,
      value: Number((e.target as HTMLInputElement).value),
    });
  };

  const inner = (
    <RatingComp
      onChange={onChange}
      value={value}
      style={{ position: 'relative', top: fixTop }}
    />
  );
  return <InlineOuterComp inner={inner} {...props} />;
}
