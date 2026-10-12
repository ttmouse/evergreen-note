import React from 'react';
import { mkid } from '../../utils/string/mkid';
import { useAwait } from '../../hooks/useAwait';
import { errorMsgStyle } from '../../components/ErrorMsg/ErrorMsg';
import { cls } from '../../styles';
import { useEditor } from '../../hooks/useEditor';
import { Editor, ReactEditor, Transforms, useReadOnly } from '../../slate.inc';
import { ElementComponentProps } from '../EditorView/EditorView';
import { InlineOuterComp } from '../Inlines/InlineOuterComp';
import { MDTableElement } from './MDTable';
import { parseTable } from './parseTable';

export type MDTableNeededProps = {
  value: string;
};

const mermaidWrapStyle = cls`
  overflow-x: auto;
`

export function MDTableComp(props: MDTableNeededProps) {
  const ref = React.useRef<HTMLDivElement>(null);
  const [id] = React.useState(mkid());
  const { value } = props;
  useAwait(async () => {
    try {
      const val = (await parseTable(value)).join('').trim();
      if (!val) throw new Error('Empty table');
      ref.current!.innerHTML = val;
    } catch (error) {
      ref.current!.innerHTML = `<div class='${errorMsgStyle}'>Table syntax error:<br /><pre>${(error as Error).message}</pre></div>`;
    }
  }, [value]);
  return <div className={`${mermaidWrapStyle} MDTable`} ref={ref} />;
}

export type MDTableElementProps = {
  value: string;
}

// 旧数据里的表格元素：照常渲染表格；点一下就把它换成节点里的普通文字（与新表格同一种存法），
// 光标停在文字末尾，之后由 ItemView/Text 按光标进出切换原文/表格。
export function MDTableElementComp(props: ElementComponentProps<MDTableElement>) {
  const { element } = props;
  const editor = useEditor();
  const readOnly = useReadOnly();
  const toText = (e: React.MouseEvent) => {
    if (readOnly) return;
    e.preventDefault();
    e.stopPropagation();
    const path = ReactEditor.findPath(editor as any, element);
    Editor.withoutNormalizing(editor, () => {
      Transforms.removeNodes(editor, { at: path });
      Transforms.insertNodes(editor, { text: element.value.trim() }, { at: path, select: true });
    });
    ReactEditor.focus(editor as any);
  };
  const inner = (
    <div onMouseDown={toText}>
      <MDTableComp value={element.value} />
    </div>
  );
  return <InlineOuterComp {...props} noFocusRing inner={inner} />;
}
