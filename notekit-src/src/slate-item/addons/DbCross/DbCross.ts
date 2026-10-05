import { IAddon, App, NewAddonParams } from '../../engine/App';
import { UnitPersist } from '../../interfaces/unit';

export function createDbCrossAddon({ app, $ }: NewAddonParams) {
  class DbCross implements IAddon {
    app!: App;
    config = {};

    addonRun() {
      // Initialization for this DbCross
    }

    async importFrom(dbid: string, filterRule?: (item: UnitPersist) => void) {
      const conn = await $.dbDisk.open(dbid);
      const list = await conn.node.toArray();
      $.dbMemory.imports(
        list.filter((item) => !filterRule || filterRule(item)),
        dbid
      );
    }
  }

  return { dbCross: new DbCross() };
}
