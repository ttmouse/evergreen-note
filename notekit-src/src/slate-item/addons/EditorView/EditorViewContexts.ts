import React from 'react';
import { ItemNode } from '../../interfaces/item';
import { ItemEditor } from '../EditorFactory/ItemEditor';
import { EditorProps } from './EditorView';

export const ContextEditorInline = React.createContext<boolean>(false);
export const ContextTopItem = React.createContext<ItemNode>({} as any);
export const ContextEditor = React.createContext<ItemEditor>({} as any);

export type EditorInfo = {
  props: EditorProps;
};
export const ContextEditorInfo = React.createContext<EditorInfo>({} as any);
