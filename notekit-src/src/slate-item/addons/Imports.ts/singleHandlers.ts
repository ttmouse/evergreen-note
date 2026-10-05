import { md2outline } from '../Paste/helper';
import { Item } from '../../interfaces/item';
import { recur } from '../../utils/recur';
import { time } from '../../utils/date/time';
import { ImportOpts } from './Imports';
import { $$ } from '../../utils/lang';
import { $t } from '../../../i18n';

export const singleHandlers = () => ({
  markdown: {
    type: 'md',
    title: 'Markdown',
    handle(content: string, opts: ImportOpts) {
      return md2outline(content, opts.ignoreEmptyLine);
    },
  },

  plain: {
    type: 'txt',
    title: $t`imports.plain_text`,
    handle(content: string, opts: ImportOpts) {
      return md2outline(content, opts.ignoreEmptyLine);
    },
  },

  // docx: {
  //   type: 'docx',
  //   title: 'Word',
  //   async handle(files: any): Promise<Partial<UnitPersist>> {
  //     await loadScript('js/mammoth.browser.js');
  //     return new Promise((resolve) => {
  //       const { mammoth } = window as any;
  //       for (const file of files) {
  //         const reader = new FileReader();
  //         reader.onload = function handler(loadEvent: any) {
  //           const arrayBuffer = loadEvent.target.result;
  //           mammoth
  //             .convertToHtml({ arrayBuffer })
  //             .then((result: any) => {
  //               const list: any = [];
  //               const div = document.createElement('div');
  //               div.innerHTML = result.value;
  //               const ps = div.querySelectorAll('h1,h2,h3,h4,h5,h6,p');
  //               for (const p of ps) {
  //                 list.push({
  //                   ori: (p as HTMLElement).innerText,
  //                 });
  //               }
  //               resolve({ subitems: list });
  //             })
  //             .done();
  //         };

  //         reader.readAsArrayBuffer(file);
  //       }
  //     });
  //   },
  // },

  // json: {
  //   type: 'json',
  //   title: 'JSON(RR)',
  //   handle(content: string, opts: { keepID: boolean }) {
  //     const data = JSON.parse(content);
  //     if (opts.keepID) {
  //       return data;
  //     }
  //     return Item.resolvePkyAndWeight(Item.clone(data) as any);
  //   },
  // },

  fulljson: {
    type: 'json',
    title: $$`JSON(RE)`,
    handle(content: string, opts: ImportOpts) {
      let data = JSON.parse(content);
      if (opts.keepID === 'new') {
        data = Item.clone(data);
      }
      if (opts.time === 'new') {
        recur(data, (item: any) => {
          item.created = time();
          item.updated = time();
        });
      } else {
        recur(data, (item: any) => {
          item.updated = time();
        });
      }
      return data;
    },
  },
});
