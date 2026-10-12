import React from 'react';
import { mkid } from '../../utils/string/mkid';
import { useAwait } from '../../hooks/useAwait';
import { errorMsgStyle } from '../../components/ErrorMsg/ErrorMsg';
import { cls } from '../../styles';
import { useAddons } from '../../hooks/useAddons';
import { useEditor } from '../../hooks/useEditor';
import { useReadOnly } from '../../slate.inc';
import { atLater } from '../../utils/atLater';
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

// 鼠标移入表格即显示 Markdown 源码（可直接编辑），移出区域且不在输入时恢复渲染。
// 2026-10-12 用户要求：表格移入即可编辑，脱离区域才重新渲染。
export function MDTableElementComp(props: ElementComponentProps<MDTableElement>) {
  const { element } = props;
  const $ = useAddons();
  const editor = useEditor();
  const readOnly = useReadOnly();
  const [hover, setHover] = React.useState(false);
  const [typing, setTyping] = React.useState(false);
  const [draft, setDraft] = React.useState(element.value);
  const [minHeight, setMinHeight] = React.useState(0);
  const host = React.useRef<HTMLDivElement>(null);
  const area = React.useRef<HTMLTextAreaElement>(null);
  const editing = !readOnly && (hover || typing);

  // 源码按内容自适应高度，像正文一样有几行占几行
  React.useLayoutEffect(() => {
    const el = area.current;
    if (!el) return;
    el.style.height = '0px';
    el.style.height = `${el.scrollHeight}px`;
  }, [editing, draft]);

  React.useEffect(() => {
    if (!typing) setDraft(element.value);
  }, [element.value, typing]);

  // 防抖回写时取最新的元素对象：每次 setNodes 后 Slate 会换新对象，旧对象 findPath 会失败
  const latest = React.useRef(element);
  latest.current = element;
  const commit = (next: string) => {
    const el = latest.current;
    if (next !== el.value) $.inlines.setProps(editor, el, { value: next, iky: el.iky });
  };
  const save = (next: string) => {
    setDraft(next);
    atLater(() => commit(next), `mdtable-${element.iky}`, 300);
  };
  const flush = () => atLater(() => commit(draft), `mdtable-${element.iky}`, -1);

  const enter = (e: React.MouseEvent) => {
    if (readOnly || e.buttons) return;
    if (!hover && !typing) setMinHeight(host.current?.offsetHeight ?? 0);
    setHover(true);
  };
  const stop = (e: React.SyntheticEvent) => e.stopPropagation();

  const inner = (
    // 仅悬停未输入时保留表格原高度（不可见占位）：源码比表格矮时指针不会落到区域外、来回闪切；
    // 点进去输入后释放，文本有多高就多高。
    <div ref={host} className="mdtable-block" style={{ minHeight: hover && !typing ? minHeight : undefined }}
      onMouseEnter={enter} onMouseLeave={() => setHover(false)}>
      {editing ? (
        <textarea
          ref={area}
          className="mdtable-source"
          spellCheck={false}
          value={draft}
          rows={1}
          onChange={(e) => save(e.target.value)}
          onFocus={() => setTyping(true)}
          onBlur={() => { flush(); setTyping(false); }}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === 'Escape') (e.target as HTMLTextAreaElement).blur();
          }}
          onKeyUp={stop}
          onKeyPress={stop}
          onBeforeInput={stop}
          onInput={stop}
          onPaste={stop}
          onCopy={stop}
          onCut={stop}
          onMouseDown={stop}
          onMouseUp={stop}
          onClick={stop}
          onDoubleClick={stop}
        />
      ) : (
        <MDTableComp value={element.value} />
      )}
    </div>
  );

  return <InlineOuterComp {...props} noFocusRing={editing} inner={inner} />;
}
