import React from 'react';
import { ElementComponentProps } from '../../EditorView/EditorView';
import { InlineOuterComp } from '../../Inlines/InlineOuterComp';
import { SlidebarComp } from './SlidebarComp';
import { useAddons } from '../../../hooks/useAddons';
import { useItem } from '../../../hooks/useItem';
import { useEditor } from '../../../hooks/useEditor';
import { cls } from '../../../styles';
import { appendStyle } from '../../../utils/dom/appendStyle';
import { ContextEditorInline } from '../../EditorView/EditorViewContexts';

appendStyle(cls`
  .node.node-with-slidebar {
    align-items: flex-start;
  }

  .node .node-head-with-slidebar {
    padding-bottom: 0px !important;
  }
`);

const sidebarStyle = cls`
  display: inline-block;
  width: calc(100% - 12px);
  margin-left: 4px;
  margin-right: 4px;
`;

export function SlidebarElementComp(props: ElementComponentProps) {
  const { element } = props;
  const { value, iky } = element;
  const isReferCxt = React.useContext(ContextEditorInline);
  if (isReferCxt) return <span className={cls`border-bottom: 1px solid var(--cl-slate-300);`}> {value}% </span>;
  const { inlines } = useAddons();
  const editor = useEditor();
  const item = useItem();
  const onChange = (e: React.ChangeEvent) => {
    inlines.setProps(editor, item.GetSlPath(), {
      iky,
      value: Number((e.target as HTMLInputElement).value),
    });
  };

  const inner = <SlidebarComp onChange={onChange} value={value} />;
  return <InlineOuterComp className={sidebarStyle} inner={inner} {...props} />;
}
