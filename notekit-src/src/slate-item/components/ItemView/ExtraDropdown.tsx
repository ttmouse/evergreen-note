import React from 'react';
import { LoadedAddons } from '../../../main';
import { ItemEditor } from '../../addons/EditorFactory/ItemEditor';
import {
  setMenuVisible,
  FloatMenuComp,
  FloatMenuProps,
  FloatMenuItem,
} from '../../addons/FloatMenu/FloatMenuComp';
import { App } from '../../engine/App';
import { useAddons } from '../../hooks/useAddons';
import { ItemNode } from '../../interfaces/item';
import { obj2list } from '../../utils/slate/helper';
import { mkid } from '../../utils/string/mkid';
import { ItemDOM } from './ItemView';

export type ExtraDropdownMenu =
  | FloatMenuProps<any>['items']
  | { [key: string]: FloatMenuItem };

export type ExtraDropdownProps = {
  name?: string;
  targetSelector: string;
  menu: ExtraDropdownMenu;
};

export type ExtraDropdownContext = {
  app: App;
  editor: ItemEditor;
  item: ItemNode;
  itemDom: ItemDOM;
  currentTarget: HTMLElement;
};

export function ExtraDropdown(props: ExtraDropdownProps) {
  const { menu, name = mkid(), targetSelector } = props;
  const $ = useAddons();

  const params: FloatMenuProps<ExtraDropdownContext> = {
    name,
    targetSelector,
    context(el) {
      const itemDom = el.closest('.note-block[data-ky]') as ItemDOM;
      const { $editor, $item } = itemDom;
      return {
        editor: $editor,
        item: $item,
        app: $.ui.app,
        currentTarget: el,
        itemDom,
      };
    },
    items: obj2list(menu, (menuItem) => {
      const { onClick } = menuItem;
      if (onClick) {
        menuItem.onClick = (e: React.MouseEvent) => {
          e.preventDefault();
          e.stopPropagation();
          onClick(e);
          setMenuVisible(name, false);
        };
      }
      return menuItem;
    }),
  };
  return <FloatMenuComp {...params} place={['right-in', 'bottom-out']} />;
}

export function createExtraDropdown(
  $: LoadedAddons,
  TriggerComp: () => JSX.Element | null,
  dropdownProps: Partial<ExtraDropdownProps> & {
    menu: ExtraDropdownMenu;
    order?: number;
  }
) {
  const { name = mkid(), menu, order = 1 } = dropdownProps;
  const MenuComp = () => {
    return (
      <ExtraDropdown
        name={name}
        targetSelector={`.node-extra > [data-dropdown='${name}']`}
        menu={menu}
      />
    );
  };
  $.ui.pushComponent(MenuComp);

  const MyTriggerComp = () => {
    return (
      <span data-dropdown={name} style={{ order }}>
        <TriggerComp />
      </span>
    );
  };

  $.editorView.addExtraItems({ [name]: MyTriggerComp });
}
