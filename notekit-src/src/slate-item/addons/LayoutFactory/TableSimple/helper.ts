import { makeAutoObservable } from 'mobx';
import { ItemDOM } from '../../../components/ItemView';
import { ItemEntry } from '../../../interfaces/item';
import { KyString } from '../../../interfaces/unit';
import { ItemEditor } from '../../EditorFactory/ItemEditor';
import { getLayout, getDepth } from '../helper';
import { findDOMIndex } from '../../../utils/dom/findDOMIndex';
import { HtmlEle } from '../../EditorView/helper';
import { Path } from '../../../slate.inc';

export function isCaretAtCell(editor: ItemEditor) {
  return getLayout(editor) === 'tablesimple' && getDepth(editor) < 3;
}

export const tableWidthStore = makeAutoObservable({
  colWidths: {} as { [ky: KyString]: number[] },

  /**
   * 设置表格列宽
   * @param tableID
   * @param colIndex
   * @param width
   * @param force 若为真，则强制将宽度设置给指定列，否则只当 width 大于当前宽度时才生效
   */
  setColWidth(tableID: string, colIndex: number, width: number, force = false) {
    this.colWidths[tableID] ??= [
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0,
    ];
    const widths = this.colWidths[tableID];
    if (
      typeof widths[colIndex] === 'undefined' ||
      widths[colIndex] < width ||
      force
    ) {
      widths[colIndex] = width;
    }
    return widths[colIndex];
  },
});

/**
 * 返回单元所在的列号，列序号是按照表格视图中所处的位置而定
 * @param ele
 * @returns
 */
export function getColIndexVirtual(ele: HtmlEle) {
  const el = ele as HTMLElement;
  if (el.closest('.node')?.matches('.node-layout-tablesimple-1')) {
    return 0;
  }
  const dom = el.closest('.node') as HTMLElement;
  if (dom && dom.matches('.node-layout-tablesimple-2')) {
    return findDOMIndex(dom, '.node-layout-tablesimple-2') + 1;
  }
  return -1;
}

export function getRowIndex(ele: HtmlEle): number {
  const el = ele as HTMLElement;
  const rowDom = el.closest('.node-layout-tablesimple-1') as HTMLElement;
  if (rowDom) {
    return findDOMIndex(rowDom, '.node-layout-tablesimple-1');
  }
  return -1;
}

export function getColEntry(ele: HtmlEle): ItemEntry | [null, null] {
  const el = ele as HTMLElement;
  const dom = el.closest('.node-layout-tablesimple-2') as ItemDOM;
  if (dom) {
    return [dom.$item, dom.$item.GetSlPath()];
  }
  const { $item: rowItem } = el.closest(
    '.node-layout-tablesimple-1'
  ) as ItemDOM;
  if (rowItem) {
    return [rowItem, rowItem.GetSlPath()];
  }
  return [null, null];
}

export function getRowEntry(ele: HtmlEle): ItemEntry {
  const el = ele as HTMLElement;
  const { $item } = el.closest('.node-layout-tablesimple-1') as ItemDOM;
  return [$item, $item.GetSlPath()];
}

export function getTableEntry(ele: HtmlEle): ItemEntry {
  const el = ele as HTMLElement;
  const { $item } = el.closest('.node-layout-tablesimple') as ItemDOM;
  return [$item, $item.GetSlPath()];
}

export function getColCount(editor: ItemEditor, tablePath: Path) {
  const pathRow = editor.itemPathFirstSubitem(tablePath);
  return editor.itemCountSubitems(pathRow) + 1;
}
