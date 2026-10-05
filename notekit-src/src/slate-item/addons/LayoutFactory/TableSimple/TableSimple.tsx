import React from 'react';
import { IAddon, App, NewAddonParams } from '../../../engine/App';
import { cover } from '../../../engine/helper';
import { Item, ItemEntry, ItemNode } from '../../../interfaces/item';
import { Editor, Node, Path, Transforms } from '../../../slate.inc';
import { ItemEditor } from '../../EditorFactory/ItemEditor';
import { TableSimpleComp } from './TableSimpleComp';
import { ItemTransforms } from '../../../transforms/item';
import { mkid } from '../../../utils/string/mkid';
import { ItemDOM } from '../../../components/ItemView';
import {
  findDOMAbove,
  findDOMBelow,
  findDOMLeft,
  findDOMRight,
} from '../../../utils/dom/findDOMByRect';
import './tablesimple.layout.less';
import { pub } from '../../../utils/pub';
import {
  getColIndexVirtual,
  getRowIndex,
  tableWidthStore,
  getRowEntry,
  getColEntry,
  getTableEntry,
  isCaretAtCell,
} from './helper';
import { showSnack } from '../../../utils/msg/showSnack';
import { tableHotkey } from './tableHotkey';
import { IAddonLayout } from '../LayoutFactory';
import { $t } from '../../../../i18n';

/**
 * 简单表格
 */
export function createTableSimpleAddon({ app, $ }: NewAddonParams) {
  class TableSimple implements IAddonLayout {
    app!: App;
    config = {};

    levelNames = {
      tablesimple: ['tablesimple', 'tablesimple-row', 'tablesimple-cell'],
    };

    getSelection(editor: ItemEditor) {
      const { itemDom } = editor.itemSelection()?.anchor;
      if (itemDom && itemDom.matches('.node-layout-tablesimple *')) {
        const [rowItem, rowPath] = getRowEntry(itemDom);
        const [colItem, colPath] = getColEntry(itemDom);
        const [tableItem, tablePath] = getTableEntry(itemDom);
        return {
          tableItem,
          tablePath,
          rowItem,
          rowPath,
          rowIndex: getRowIndex(itemDom),
          colItem,
          colPath,
          colIndexVirtual: getColIndexVirtual(itemDom),
          isCell: isCaretAtCell(editor),
          isFirstCol: colPath && Path.equals(rowPath, colPath),
        };
      }
      return null;
    }

    /**
     * 设置某一列的宽度
     * @param tableID
     * @param colIndex
     * @param width
     * @param force
     */
    setColWidth(
      tableID: string,
      colIndex: number,
      width: number,
      force = false
    ) {
      tableWidthStore.setColWidth(tableID, colIndex, width, force);
    }

    /**
     * 获取某一列的宽度
     * @param tableID
     * @returns
     */
    getColWidths(tableID: string) {
      return tableWidthStore.colWidths[tableID] || [];
    }

    /**
     * 移动列
     * @param editor
     * @param options
     */
    moveColumn(
      editor: ItemEditor,
      options: {
        tablePath: Path;
        colIndex: number; // 移动的列索引
        direction: 'left' | 'right';
      }
    ) {
      const { tablePath, colIndex, direction } = options;

      if (
        (colIndex === 0 && direction === 'right') ||
        (colIndex === 1 && direction === 'left')
      ) {
        this.changeFirstColumn(editor, tablePath, 1);
        return;
      }

      const p = direction === 'left' ? 1 : 0;
      if (colIndex > p) {
        const cells = this.eachCellInColumn(editor, tablePath, colIndex);
        for (const c of cells) {
          if (direction === 'left') {
            ItemTransforms.moveUpItems(editor, { at: c.colPath });
          } else {
            ItemTransforms.moveDownItems(editor, { at: c.colPath });
          }
        }
      }
    }

    /**
     * 删除列
     * @param editor
     * @param tablePath
     * @param colIndexVirtual
     */
    removeColumn(editor: ItemEditor, tablePath: Path, colIndexVirtual: number) {
      const cells = this.eachCellInColumn(editor, tablePath, colIndexVirtual);
      for (const c of cells) {
        ItemTransforms.removeItems(editor, { at: c.colPath });
      }
    }

    /**
     * 删除行
     * @param editor
     * @param options
     */
    removeRow(editor: ItemEditor, options: { at: Path }) {
      editor.itemRemove(options.at);
    }

    /**
     * 往表格中插入一行
     * @param editor
     * @param options
     */
    insertRow(
      editor: ItemEditor,
      options: {
        at: Path; // table item path
        pos: number; // insert position
        focus?: boolean; // focus the first cell
      }
    ) {
      const rowKy = mkid();
      const { at: tableItemPath, pos, focus } = options;
      const lastRowPath = editor.itemPathLastSubitem(tableItemPath);

      const colItms = editor
        .itemSubitems(lastRowPath)
        .map((item: any, i: number) =>
          Item.make({ ori: '', pky: rowKy, weight: (i + 1) * 1000 }, { editor })
        );

      const rowItem = Item.make(
        { ky: rowKy, ori: '', subitems: colItms },
        { editor }
      );

      ItemTransforms.insertItems(editor, {
        at: tableItemPath,
        items: rowItem,
        pos,
      });
      if (focus) {
        editor.itemFocus(editor.itemPathLastSubitem(tableItemPath));
      }
    }

    /**
     * 往表格插入一列
     * @param editor
     * @param options
     */
    insertColumn(editor: ItemEditor, options: { at: Path; pos: number }) {
      const { at: tableItemPath, pos } = options;
      const p = editor.itemPathSubitems(tableItemPath);
      for (const [item, path] of Node.children(editor, p)) {
        ItemTransforms.insertItems(editor, {
          items: Item.make({ ori: '', pky: (item as ItemNode).ky }, { editor }),
          at: path,
          pos,
        });
      }
      const firstRowSubitemsPath = editor.itemPathFirstSubitem(tableItemPath);
      const lastColPath = editor.itemPathLastSubitem(firstRowSubitemsPath);
      editor.itemFocus(lastColPath);
    }

    addSlashMenu() {
      const { slashMenu } = this.app.addons;
      slashMenu?.addItems({
        slashTableSimple: {
          icon: 'svg_table_simple',
          title: $t`tableSimple.slash_menu_title`,
          order: slashMenu.order.layout,
          versions: {
            en: { v: 'as simple table' },
            pingyin: { v: 'jian dan biao ge' },
            py: { v: 'jdbg' },
            cn: { v: '简单表格' },
          },
          handle({ editor }) {
            if (editor.itemParent().layout === 'tablesimple') {
              showSnack({
                content: $t`tableSimple.first_column_layout_error`,
                severity: 'error',
              });
              slashMenu.insertText(editor, '');
              return;
            }
            slashMenu.insertText(editor, '');
            editor.itemSetProps({ layout: 'tablesimple' });
          },
        },
      });
    }

    /**
     * 将第一列和其他列对调
     * 由于表格是基于大纲的数据结构，
     * 所以对于第一列的操作很多时候都要特殊处理
     * @param editor
     * @param tablePath
     * @param colIndexVirtual
     * @returns
     */
    changeFirstColumn(
      editor: ItemEditor,
      tablePath: Path,
      colIndexVirtual: number
    ) {
      const cells = Array.from(
        this.eachCellInColumn(editor, tablePath, colIndexVirtual)
      );
      if (cells.some((c) => editor.itemHasSubitems(c.colPath))) {
        showSnack({
          content: $t`tableSimple.first_column_subitems_error`,
          severity: 'error',
        });
        return;
      }
      Editor.withoutNormalizing(editor, () => {
        for (const c of cells) {
          const rowRef = Editor.pathRef(editor, c.rowPath);
          const colRef = Editor.pathRef(editor, c.colPath);
          if (colRef.current) {
            editor.itemOutdent(colRef.current);
            ItemTransforms.moveUpItems(editor, { at: colRef.current });
            editor.itemIndent(rowRef.current!);
            ItemTransforms.outdentSubItems(editor, { at: rowRef.current! });
          }
          rowRef.unref();
          colRef.unref();
        }
      });
    }

    /**
     * 控制光标在单元格之间移动
     * @param fromItemDom
     * @param direction
     * @returns
     */
    moveCaret(
      fromItemDom: ItemDOM,
      direction: 'above' | 'below' | 'left' | 'right',
      placement: 'start' | 'end' = 'start'
    ) {
      let toDom: HTMLElement | null = null;
      const parent = fromItemDom.closest(
        '.node-layout-tablesimple'
      ) as HTMLElement;
      switch (direction) {
        case 'above':
          toDom = findDOMAbove(fromItemDom, '.node-head', parent);
          break;
        case 'below':
          toDom = findDOMBelow(fromItemDom, '.node-head', parent);
          break;
        case 'left':
          toDom = findDOMLeft(fromItemDom, '.node-head', parent);
          break;
        case 'right':
          toDom = findDOMRight(fromItemDom, '.node-head', parent);
          break;
      }
      if (toDom) {
        const { $item, $editor } = toDom.closest('.node') as ItemDOM;
        if ($item && $editor) {
          if (placement === 'start') {
            $editor.itemFocus($item.GetSlPath());
          } else {
            $editor.itemFocusEnd($item.GetSlPath());
          }
          return true;
        }
      }
      return false;
    }

    modifyHotkey() {
      tableHotkey(this.app);
    }

    /**
     * 遍历某一列的所有单元格
     * @param editor
     * @param tablePath
     * @param colIndex
     */
    *eachCellInColumn(
      editor: ItemEditor,
      tablePath: Path,
      colIndexVirtual: number
    ) {
      let rowId = 0;
      for (const [rowItem, rowPath] of Node.children(
        editor,
        editor.itemPathSubitems(tablePath)
      )) {
        const subPath = editor.itemPathSubitems(rowPath);
        const colPath = [...subPath, colIndexVirtual - 1];
        const colItem = Node.get(editor, colPath);
        yield {
          rowId,
          colIndexVirtual,
          colOriginalIndex: colIndexVirtual - 1,
          rowItem,
          rowPath,
          subPath,
          colItem,
          colPath,
        };
        rowId++;
      }
    }

    /**
     * 如果一个表格的单元格是空的，则重新添加一些初始的行与列
     * @param editor
     * @param tablePath
     */
    insertRowsIfNeeded(editor: ItemEditor, tablePath: Path) {
      if (editor.itemCountSubitems(tablePath) < 1) {
        const rowKy = mkid();
        if (editor.itemTextPlain().length < 1) {
          editor.itemFocus(tablePath);
          editor.insertText($t`tableSimple.untitled`);
          Transforms.select(editor, editor.itemPathText());
        }
        ItemTransforms.insertItems(editor, {
          at: tablePath,
          items: Item.make(
            {
              ori: '',
              ky: rowKy,
              subitems: [{ ori: '', weight: 5000, pky: rowKy }],
            },
            { editor }
          ),
        });
        const rowKy2 = mkid();
        ItemTransforms.insertItems(editor, {
          at: tablePath,
          pos: Infinity,
          items: Item.make(
            {
              ori: '',
              ky: rowKy2,
              subitems: [{ ori: '', weight: 5000, pky: rowKy2 }],
            },
            { editor }
          ),
        });
      }
    }

    /**
     * 如果某一行的列数与其他行不一致，则补足它的列数
     * @param editor
     * @param rowPath
     */
    insertColsIfNeed(editor: ItemEditor, rowPath: Path) {
      const siblingRowPath = editor.itemPathPrev(rowPath);
      if (siblingRowPath) {
        const rowColCount = editor.itemCountSubitems(rowPath);
        const prevColCount = editor.itemCountSubitems(siblingRowPath);
        const diff = prevColCount - rowColCount;
        if (diff > 0) {
          for (let i = 0; i < diff; i++) {
            ItemTransforms.insertItems(editor, {
              at: rowPath,
              pos: -1,
            });
          }
        }
      }
    }

    addonInfo() {
      return {
        title: $t`tableSimple.title`,
        quote: $t`tableSimple.quote`,
        defaultValue: 'on',
        type: 'fieldset',
      };
    }

    addonRun() {
      const { editorView, tableSimple } = this.app.addons;

      pub.on(
        pub.evt.editorNormalized,
        (editor: ItemEditor, entry: ItemEntry) => {
          const [item, path] = entry;

          if (Path.equals(path, [0])) {
            return;
          }

          if (item.layout === 'tablesimple') {
            tableSimple.insertRowsIfNeeded(editor, path);
            return;
          }

          const parentItem = editor.itemParent(path);
          if (parentItem.layout === 'tablesimple') {
            tableSimple.insertColsIfNeed(editor, path);
            return;
          }
          return true;
        }
      );

      this.addSlashMenu();
      this.modifyHotkey();

      const { renderElement } = editorView;
      cover(renderElement, (props) => {
        // const { element: item, children, attributes } = props;
        return (
          <TableSimpleComp {...props}>
            {renderElement.call(editorView, props)}
          </TableSimpleComp>
        );
        // return renderElement.call(editorView, props);
      });
    }
  }

  return {
    tableSimple: new TableSimple(),
  };
}
