import React from 'react';
import { ElementComponentProps } from '../EditorView/EditorView';
import { PlaceholderElement } from './Placeholder';
import { InlineOuterComp } from '../Inlines/InlineOuterComp';
import {
  useFocused,
  useSelected,
  Path,
  ReactEditor,
  Transforms,
  Range,
} from '../../slate.inc';
import { useEditor } from '../../hooks/useEditor';
import { AutoGrowInput } from './AutoGrowInput';

export function PlaceholderElementComp(
  props: ElementComponentProps<PlaceholderElement>
) {
  const editor = useEditor();
  const { element } = props;
  const { placeholder } = element;

  const onChange = (v: string) => {
    const path = ReactEditor.findPath(editor as any, element);
    const nextPath = Path.next(path);
    ReactEditor.focus(editor as any);
    Transforms.select(editor, {
      path: nextPath,
      offset: 0,
    });
    editor.insertText(v);
    Transforms.removeNodes(editor, { at: path });
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      const path = ReactEditor.findPath(editor as any, element);
      const nextPath = Path.next(path);
      ReactEditor.focus(editor as any);
      Transforms.select(editor, {
        path: nextPath,
        offset: 0,
      });
      e.preventDefault();
      e.stopPropagation();
    }
  };

  const inner = (
    <AutoGrowInput
      onKeyDown={onKeyDown}
      placeholder={placeholder}
      onChange={onChange}
    />
  );
  return <InlineOuterComp inner={inner} {...props} />;
}
