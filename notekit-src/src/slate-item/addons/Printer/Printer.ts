import { IAddon, App, NewAddonParams } from '../../engine/App';
import { $$ } from '../../utils/lang';
import { showSnack } from '../../utils/msg/showSnack';

export function createPrinterAddon({ app, $ }: NewAddonParams) {
  class Printer implements IAddon {
    app!: App;
    config = {};

    exec(editorDom: HTMLElement) {
      if (!editorDom) {
        showSnack({
          content: $$`No editor view found`,
          severity: 'error',
        });
        return;
      }

      // create an iframe
      const iframe = document.createElement('iframe');
      iframe.classList.add('print-iframe');
      Object.assign(iframe.style, {
        width: '100%',
        height: '100%',
        border: 'none',
        opacity: 0,
        'pointer-events': 'none',
      });
      document.body.appendChild(iframe);

      // then clone the document to the iframe
      const iframeDoc = iframe.contentDocument!;
      iframeDoc.open();
      iframeDoc.write(document.head.outerHTML);
      iframeDoc.write(
        `<style>
          body {
            overflow: auto !important;
            height: auto !important;
          }

          .editor-toolbar {
            display: none;
          }

          .node-top > .node-head > .node-extra {
            display: none;
          }

          [data-icon='expand'] {
            display: none;
          }

          .node-tools {
            top: -12px;
          }
          </style>
        `
      );
      iframeDoc.write(editorDom.outerHTML);
      iframeDoc.close();
      iframe.contentWindow?.print();
    }

    addonRun() {
      // Initialization for this Print
      const { langs } = this.app;

      // $.editorView.addDropdown({
      //   print: {
      //     title: langs.print,
      //     icon: 'svg_print',
      //     onClick() {
      //       const editorDom = document.querySelector(
      //         '.main-area .editor-view'
      //       ) as HTMLElement;
      //       if (editorDom) {
      //         $.printer.exec(editorDom);
      //       }
      //     },
      //   },
      // });

      window.onafterprint = () => {
        document.querySelectorAll('.print-iframe').forEach((ele) => {
          ele.remove();
        });
      };
    }
  }

  return { printer: new Printer() };
}
