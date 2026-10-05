import React from 'react'
import { $t } from '../../../i18n'
import { IAddon, App, NewAddonParams } from '../../engine/App'
import { Item, ItemNode } from '../../interfaces/item'
import { ItemWithAnnotation, ItemWithPDFAttachment, PDFReaderComp } from './PDFReaderComp'
import { loadScript } from '@/slate-item/utils/dom/loadScript'
import { useItem } from '@/slate-item/hooks/useItem'
import { useAddons } from '@/slate-item/hooks/useAddons'
import { before, cover } from '@/slate-item/engine/helper'
import { appendStyle } from '@/slate-item/utils/dom/appendStyle'
import { ContextEditorInline } from '../EditorView/EditorViewContexts'
import { AttachmentElement } from '../Attachment/Attachment'
import { Node } from 'slate'

export function createPdfReaderAddon({ app, $ }: NewAddonParams) {
  class PDFReader implements IAddon {
    app!: App
    config = {}
    toLinkItem: ItemNode | null = null

    addonInfo() {
      return {
        title: $t`PDFReader`,
        quote: "PDFReader with annotation support",
        defaultValue: 'on',
        type: 'fieldset',
        updated: 2024_09_06,
      }
    }

    show(url: string, filename: string, page: number, node: UnitPersist, nodeShow: UnitPersist) {
      const rect = document.getElementById(`${app.appName}-outer`)?.getBoundingClientRect()
      $.floatViewer.showDialog({
        body: <PDFReaderComp url={url} page={page} node={node} nodeShow={nodeShow} />,
        DialogProps: {
          width: app.states.floatViewerMode=='fixed' ? (visualViewport?.width||window.innerWidth) : (rect?.width || 800) - 40,
          canPin: {
            pin: true,
          },
          cssClass: ['node-head-visible', 'pdfreader-dialog'],
          attributes: {
            'dialog-list-mode': app.states.floatViewerMode,
          }
        },
        isPin: true,
        key: node.ky+"-pdfreader",
        title: `PDF ${filename}`
      })
    }

    findPDFNodeInfo(ctxItem: UnitPersist): { pdfItem: UnitPersist | null, attachmentEle: AttachmentElement | null } {
      const ancestorKys = [...ctxItem.path].reverse();
      ancestorKys.unshift(ctxItem.ky);
      let pdfItem: UnitPersist | null = null;
      let attachmentEle: AttachmentElement | null = null;
      for (const ky of ancestorKys) {
        const aItem = $.dbMemory.getItem(ky);
        for (const leaf of (aItem?.leaves as Node[]||[])) {
          if ((leaf as AttachmentElement).blockType === "attachment" && (leaf as AttachmentElement).path.endsWith(".pdf")) {
            return { pdfItem: aItem, attachmentEle: leaf as AttachmentElement };
          }
        }
      }
      return { pdfItem, attachmentEle };
    }

    addonRun() {
      $.editorView.addExtraItems({
        PDFPageBtn() {
          const ctxItem = useItem() as ItemWithAnnotation;
          const isReferCxt = React.useContext(ContextEditorInline);
          if((!isReferCxt) && ctxItem && ctxItem.annotate) {
            return <span className="PDFPageBtn" onClick={(e: React.MouseEvent) => {
              const { pdfItem, attachmentEle } = $.pdfReader.findPDFNodeInfo(ctxItem);
              if (!pdfItem) return;
              const { page } = ctxItem.annotate;
              const annotationId = ctxItem.ky;
              const controller = ((document.querySelector( `#floatview-${pdfItem.ky}-pdfreader .pdfreader-wrap iframe`) as HTMLIFrameElement)?.contentWindow as any)?.PDFReader;
              if (controller) controller.gotoAnnotation?.(annotationId, page ?? 1);
              else {
                if (!attachmentEle) return;
                let path = attachmentEle.path.replace(/^https?:/i, '');
                if(path.startsWith("data/")) path = "/v2/"+path;
                $.pdfReader.show(path, attachmentEle.name, page ?? 1, pdfItem, ctxItem);
              }
            }}>
              P{ctxItem.annotate.page}
            </span>
          } else {
            return null;
          }
        }
      });
      const {open} = $.attachment;
      cover(open, (path: string, node: ItemWithPDFAttachment)=>{
        const latestNode = $.dbMemory.getItem(node.ky) as ItemWithPDFAttachment;
        if (path.endsWith('.pdf')) {
          loadScript("js/canvas2image.js");
          if(path.startsWith("data/")) path = "/v2/"+path;
          const attachmentEle: AttachmentElement = node.leaves.find(e=>(e as any).blockType==="attachment") as AttachmentElement;
          $.pdfReader.show(path, attachmentEle.name, latestNode.curPage ?? 1, node, node);
          return;
        } else {
          return open.call($.attachment, path, node);
        }
      })
      $.slashMenu?.addItems({
        slashPdfLink: {
          icon: 'svg_document',
          title: $t`Link to PDF Item`,
          order: 10000,
          versions: {
            en: { v: 'link to pdf item' },
            pingyin: { v: 'lian jie pdf' },
            py: { v: 'ljpdf' },
            cn: { v: '链接到PDF项目' },
          },
          handle({ editor }) {
            const item = editor.item();
            $.slashMenu.insertText(editor, '');
            $.pdfReader.toLinkItem = item;
          },
        },
      })
    }
  }

  return { pdfReader: new PDFReader() }
}
