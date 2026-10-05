import { ItemEditor } from '../EditorFactory/ItemEditor';

export const getDepth = (editor: ItemEditor) => {
  const { itemDom } = editor.itemSelection().anchor;
  return Number(itemDom.getAttribute('ctx-depth'));
};

export const getLayout = (editor: ItemEditor) => {
  const { itemDom } = editor.itemSelection().anchor;
  return itemDom.getAttribute('ctx-layout');
};
