import { Item } from '../../interfaces/item';
import { UNIT_ROLE } from '../../interfaces/unit';
import { time } from '../../utils/date/time';
import { KYS } from '../../utils/string/mkid';
import { omitItemKeys, compress } from '../Exports/helper';
import { makeDbid } from '../DbDisk/helper';
import { LibraryPersist } from './LibAdmin';
import { MEMBER_ID } from '../../constants';

export type DbAdminHandlerParams = {
  app: string;
  version: string;
  format: string;
};

export function newLibrary(values: Object): LibraryPersist {
  return {
    ky: makeDbid(MEMBER_ID),
    pky: String(MEMBER_ID),
    role: UNIT_ROLE.LIBRARY,
    path: [],
    created: time(),
    updated: time(),
    weight: time(),
    ori: 'Untitled library',
    ...values,
  } as any;
}

export const exportDatabaseHanlders = {
  rdb: {
    ext: 'rdb',
    exports(items: UnitPersist[], infos: DbAdminHandlerParams) {
      const result = {
        ...infos,
        list: exportDatabaseHanlders.compress.exports(items),
      };
      return result;
    },
  },

  fulljson: {
    ext: 'json',
    exports(items: UnitPersist[]) {
      const result: any = [];
      for (const item of items) {
        if (!Item.isNormalStatus(item)) {
          continue;
        }
        result.push(omitItemKeys(item));
      }
      return result;
    },
  },

  compress: {
    ext: 'json',
    exports(items: UnitPersist[]) {
      const result: any = [];
      for (const item of items) {
        if (!Item.isNormalStatus(item)) {
          continue;
        }
        result.push(compress(item));
      }
      return result;
    },
  },
};

// export async function findAllNativeLibs() {
//   const libs = await Dexie.getDatabaseNames();
//   const shouldHas = ['node', 'cached', 'docver'];
//   const nativeIsLib = async (dbid: string) => {
//     const conn = $.dbDisk.open(dbid);
//     for (const tbName of shouldHas) {
//       for (const tb of conn.tables) {
//         if (tb.name === 'node') {
//           const count = await tb.count();
//           if (count < 1) {
//             return false;
//           }
//         }
//         if (tb.name === tbName) {
//           return true;
//         }
//       }
//     }
//     return false;
//   };
//   const list: string[] = [];
//   for (const dbid of libs) {
//     if (await nativeIsLib(dbid)) {
//       list.push(dbid);
//     }
//   }
//   return list;
// }
