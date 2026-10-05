import { IAddon, App, NewAddonParams } from '../../engine/App';
import { FeatureItem } from '../EditorView/EditorView';
import { ItemMenuBtn } from '../../components/ItemView/ItemMenuBtn';
import { FoldupBtn } from '../../components/ItemView/FoldupBtn';
import { UnitPersist } from '../..';
import { browser } from '@/slate-item/utils/browser';

export function createItemToolbarAddon({ app, $ }: NewAddonParams) {
  class ItemToolbar implements IAddon {
    app!: App;
    config = {};

    items: { [k: string]: FeatureItem } = {};
    addItems(items: { [k: string]: FeatureItem }) {
      Object.assign(this.items, items);
    }

    route(item: UnitPersist, ...args: any[]) {
      $.router.to(item, ...args);
    }

    addonRun() {
      $.itemToolbar.addItems({
        ItemMenuBtn,
        FoldupBtn,
      });
    }
  }

  return { itemToolbar: new ItemToolbar() };
}
