import React from 'react';
import { mkid } from '../../utils/string/mkid';
import { isEmpty } from '../../utils/isEmpty';
import { useAwait } from '../../hooks/useAwait';
import { errorMsgStyle } from '../../components/ErrorMsg/ErrorMsg';
import { cls, colorBase } from '../../styles';
import { useAddons } from '../../hooks/useAddons';
import { useEditor } from '../../hooks/useEditor';
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

export function MDTableElementComp(props: ElementComponentProps<MDTableElement>) {
  const { element } = props;
  const { value } = element;

  return (
    <InlineOuterComp {...props} inner={<MDTableComp value={value} />} />
  );
}