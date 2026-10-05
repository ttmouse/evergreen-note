import React from 'react';
import { ContextEditor } from '../addons/EditorView/EditorViewContexts';
import { ItemDOM } from '../components/ItemView';

export function useEditor() {
  const ctxEditor = React.useContext(ContextEditor);
  return ctxEditor;
}