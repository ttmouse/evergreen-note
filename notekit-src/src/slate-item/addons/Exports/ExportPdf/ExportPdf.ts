import { Item } from '../../..';
import { $t } from '../../../../i18n';
import { IAddon, App, NewAddonParams } from '../../../engine/App';
import { cover } from '../../../engine/helper';
import { exportAsPDF } from './helper';

export function createExportPdfAddon({ app, $ }: NewAddonParams) {
  class PdfExport implements IAddon {
    app!: App;
    config = {};

    addonInfo() {
      return {
        title: $t`exportPdf.title`,
        quote: $t`exportPdf.quote`,
        type: 'fieldset',
        defaultValue: 'on',
        depend: ['exports', 'printer'],
        updated: 20221022,
      };
    }

    addonRun() {
      // 当选中导出格式为 PDF 时，显示一些帮助提示
      const { popup } = $.form;
      cover(popup, (formInfo) => {
        if (formInfo.name === 'exports-form') {
          Object.assign(formInfo.subitems, {
            printHelp: {
              type: 'alert',
              when: { format: 'pdf' },
              quote: $t(`exportPdf.notice`, { appName: app.appName }),
            },
          });
        }
        return popup.call($.form, formInfo);
      });

      $.exports?.addFormats({
        pdf: {
          type: 'pdf',
          title: 'PDF',
          handle({ item }) {
            const itemDom = document.getElementById(item.$id);
            const editorDom = itemDom?.closest('.editor-view') as HTMLElement;
            if (editorDom) {
              $.printer.exec(editorDom!);
            }
            return '';
          },
        },
      });
    }
  }

  return { pdfExport: new PdfExport() };
}
