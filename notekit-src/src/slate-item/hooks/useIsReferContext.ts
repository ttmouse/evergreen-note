import React from 'react';
import { ContextEditorInline } from '../addons/EditorView/EditorViewContexts';
import { ContextEditorReference } from '../addons/Embed/EmbedContexts';
import { ContextWhiteboardLayout } from '../addons/LayoutFactory/Whiteboard/WhiteboardCanvas';

export function useIsReferContext() {
  const isInline = React.useContext(ContextEditorInline);
  const isEmbed = React.useContext(ContextEditorReference);
  const isWhiteboardLayout = React.useContext(ContextWhiteboardLayout);
  return isInline || isEmbed || isWhiteboardLayout;
}
