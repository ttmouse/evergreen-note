import { IAddon, App, NewAddonParams } from '../../engine/App';
import { cover } from '../../engine/helper';
import { KyString, UnitPersist } from '../../interfaces/unit';
import { pub } from '../../utils/pub';
import { NoteDatabase } from '../DbDisk/NoteDatabase';

export function createCacherAddon({ app, $ }: NewAddonParams) {
  const conn = new NoteDatabase(app.options.dbids[0]);

  class Cacher implements IAddon {
    app!: App;
    config = {};
    data: { [ky: KyString]: UnitPersist } | null = null;

    async save(item: UnitPersist) {
      $.cacher.data ??= {};
      $.cacher.data[item.ky] = item;
      (await conn).cached.put(item);
    }

    get(ky: KyString) {
      return $.cacher.data?.[ky];
    }

    async load() {
      const list = await (await conn).cached.toArray();
      const data = {} as any;
      for (const item of list) {
        data[item.ky] = item;
      }
      $.cacher.data = data;
      pub.emit(pub.evt.cacheLoaded, data);
    }

    addonRun() {
      // Initialization for this Cacher
    }
  }

  const cacher = new Cacher();
  const { execAddonBeforeRunAll } = app;
  cover(execAddonBeforeRunAll, async () => {
    await cacher.load();
    await execAddonBeforeRunAll.call(app);
  });

  return { cacher };
}
