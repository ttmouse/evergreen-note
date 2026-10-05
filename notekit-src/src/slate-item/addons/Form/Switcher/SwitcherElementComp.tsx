import React from 'react';
import { ElementComponentProps } from '../../EditorView/EditorView';
import { InlineOuterComp } from '../../Inlines/InlineOuterComp';
import { SwitcherComp } from './SwitcherComp';
import { useAddons } from '../../../hooks/useAddons';
import { useItem } from '../../../hooks/useItem';
import { useEditor } from '../../../hooks/useEditor';

export function SwitcherElementComp(props: ElementComponentProps) {
  const { inlines } = useAddons();
  const editor = useEditor();
  const item = useItem();
  const { element } = props;
  const { value, iky } = element;
  const onChange = (e: React.ChangeEvent) => {
    inlines.setProps(editor, item.GetSlPath(), {
      iky,
      value: (e.target as HTMLInputElement).checked,
    });
  };
  return (
    <InlineOuterComp
      inner={<SwitcherComp onChange={onChange} value={value} />}
      {...props}
    />
  );
}
