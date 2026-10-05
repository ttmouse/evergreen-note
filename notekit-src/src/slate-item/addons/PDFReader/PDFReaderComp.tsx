import React from 'react';
import { useAddons } from '../../hooks/useAddons';
import { cls, colorBase } from '../../styles';
import './pdfReader.less';
import { withFilterBox } from '../../components/IconItem/withFilterBox';
import { $t } from '../../../i18n';
import { PDFReaderIframeComp } from './PDFReaderIframeComp';
import { FloatViewerComp } from '../FloatViewer/FloatEditorComp';
import { Item, ItemNode } from '@/slate-item';
import { mkid } from '@/slate-item/utils/string/mkid';
import { intval } from '@/slate-item/utils/number/intval';
import { atLater } from '@/slate-item/utils/atLater';
import { AttachmentElement } from '../Attachment/Attachment';
import { pub } from '@/slate-item/utils/pub';
import { ResizablePDFReaderIframe } from './ResizablePDFReaderIframe';
export type AnnotateItem = {
  uuid: string;
  content: string;
  class: string;
  annotation: any;
  doc?: any;
  page?: number;
}
export type ItemWithAnnotation = ItemNode & {
  annotate: AnnotateItem;
}
export type ItemWithPDFAttachment = ItemNode & {
  curPage?: number;
}

export function PDFReaderComp(props: { url: string; page: number, node: UnitPersist, nodeShow: UnitPersist }) {
  const ifrRef = React.useRef<HTMLElement>(null);
  const wrapperRef = React.useRef<HTMLDivElement>(null);
  const resizableContainerRef = React.useRef<HTMLDivElement>(null);
  const $ = useAddons();

  function capture({ bullet: e, wrap: t, annotation: i, pageNumber: n }: { bullet: any, wrap: any, annotation: any, pageNumber: number }) {
    return new Promise((o => {
      let { x: a, y: s, width: r, height: l } = i;
      const d = t.contentWindow.document.querySelector(`#page${n}`)
        , rect = d.getBoundingClientRect()
        , c = rect.width
        , p = rect.height
        , u = d.width
        , h = d.height
        , m = parseFloat(t.contentWindow.document.querySelector("input.scale").value)
        , g = u / c
        , f = h / p
        , y = document.createElement("canvas");
      y.width = r * m * g,
        y.height = l * m * f;
      const b = y.getContext("2d")
        , v = (window as any).Canvas2Image.convertToImage(d, u, h);
      var w = new Image;
      w.crossOrigin = "*",
        w.src = v.src,
        w.width = u,
        w.height = h,
        w.onload = async function () {
          b!.drawImage(w, a * m * g, s * m * f, r * m * g, l * m * f, 0, 0, r * m * g, l * m * f);
          const t = (window as any).Canvas2Image.convertToPNG(y, r * m * g, l * m * f)
            , n = await $.img.uploadDataURL(t.src, "");
          e.ori = `![](${n.node.fileInfo.path})`,
          e.leaves = [$.img.createElement({src: n.node.fileInfo.path, alt: ''}),{ text: '' },]
            e.annotate.shot = {
              scale: m,
              wrate: g,
              hrate: f,
              ...n
            },
            o(e)
        }
    }
    ))
  };

  let prepared = 0;
  let outlineController: HTMLElement | null = null;

  const initPdfReader = () => {
    const PDFReader = ((ifrRef?.current as HTMLIFrameElement)?.contentWindow as any)?.PDFReader!;
    Object.assign(PDFReader, {
      handleAnnotationClick: (e: { target: any; documentId: any; annotationId: any }) => {
        if (e.annotationId in $.dbMemory.nodes) outlineController!.dispatchEvent(new CustomEvent('zoomIn', { detail: e.annotationId }));
        PDFReader.goRight();
      },
      handleAnnotationBlur: (e: { documentId: any }) => {
        outlineController!.dispatchEvent(new CustomEvent('zoomIn', { detail: props.node.ky }));
      },
      updatePageCurrent(page: number) {
        atLater(() => {
          const item = $.dbMemory.getItem(props.node.ky) as ItemWithPDFAttachment;
          if (item && item.curPage !== page) {
            item.curPage = page;
            $.refresh.withoutRefreshing(() => {
              $.dbMemory.saveItem(item);
            })
          }
        }, `pdfreader-${props.node.ky}-save-cur-page`, 500);
      },
      goLeft() {
        wrapperRef.current!.scrollLeft = 0
      },
      goRight() {
        wrapperRef.current!.scrollLeft = visualViewport?.width || 0
      }
    })
    Object.assign(PDFReader.localStoreAdapter, {
      async addComment(e: any, t: any, i: any) {
        const n = {
          class: "Comment",
          uuid: ($.pdfReader.toLinkItem?.ky) || mkid(),
          annotation: t,
          content: i,
        };
        if($.pdfReader.toLinkItem) {
          if($.pdfReader.toLinkItem.annotate) PDFReader.deleteAnnotation($.pdfReader.toLinkItem.ky);
          $.dbMemory.saveItem(Object.assign($.dbMemory.getItem($.pdfReader.toLinkItem.ky), {annotate: n}));
          $.pdfReader.toLinkItem = null;
        } else {
          const item = Item.newItem({
            pky: (outlineController?.firstChild?.firstChild?.firstChild?.firstChild as any)?.$item?.ky || props.node.ky,
            annotate: n,
            ky: n.uuid,
            weight: Date.now(),
          } as ItemWithAnnotation);
          $.dbMemory.saveItem(item);
        }
        return n;
      },
      async getComments(e: any, t: any) {
        const subitems = $.dbMemory.getItem(props.node.ky, { isRecur: true }).subitems;
        const n: ItemWithAnnotation[] = [];
        subitems && (subitems as any).forEach((item: any) => {
          n.push(item.annotate || {
            class: "Comment",
            uuid: item.ky,
            content: item.ori,
            annotation: t,
          })
        })
        return n;
      },
      async addAnnotation(i: any, n: any, o: any) {
        if (o.type !== "area" && !o.content) return null;
        const docInfo = (props.node.leaves.find(e => (e as any).blockType === 'attachment') as any)!.name;
        o.doc = { name: docInfo };
        o.class = "Annotation";
        o.uuid = ($.pdfReader.toLinkItem?.ky) || mkid();
        o.page = n;
        let info = {
          annotate: o as AnnotateItem,
          ky: o.uuid,
          ori: o.type as string,
          pky: (outlineController?.firstChild?.firstChild?.firstChild?.firstChild as any)?.$item?.ky || props.node.ky,
          weight: Date.now(),
        };
        switch (o.type) {
          case "area":
            info = await capture({ bullet: info, wrap: ifrRef.current, annotation: o, pageNumber: n }) as any;
            break;
          case "textbox":
            info.ori = o.content;
            break;
          case "point":
            info.ori = "";
            break;
          case "highlight":
            (info as any).blockType = "blockquote"
            if (o.content.includes('\n') && confirm($t`Do you want to delete line breaks in the highlighted text?`)) {
              info.ori = o.content.replaceAll('\n', ' ');
            } else info.ori = o.content;
            break;
        }
        if($.pdfReader.toLinkItem) {
          if($.pdfReader.toLinkItem.annotate) PDFReader.deleteAnnotation($.pdfReader.toLinkItem.ky);
          $.dbMemory.saveItem(Object.assign($.dbMemory.getItem($.pdfReader.toLinkItem.ky), {annotate: o}));
          $.pdfReader.toLinkItem = null;
        } else {
          $.dbMemory.saveItem(info as unknown as UnitPersist);
        }
        outlineController!.dispatchEvent(new CustomEvent('zoomIn', { detail: o.uuid }));
        return o;
      },
      async getAnnotations(e: any, t: any) {
        const i: AnnotateItem[] = [];
        const subitems = $.dbMemory.getItem(props.node.ky, { isRecur: true }).subitems;
        const processSubitems = (subitems: Partial<UnitPersist>[]) => {
          subitems.forEach((item: any) => {
            if (item.annotate && item.annotate.class && item.annotate.class === "Annotation" && intval(item.annotate.page) === intval(t)) {
              i.push(item.annotate);
            }
            if (item.subitems) {
              processSubitems(item.subitems);
            }
          });
        }
        subitems && processSubitems(subitems as any);
        return {
          documentId: e,
          pageNumber: t,
          annotations: i,
        }
      },
      async getAnnotation(e: any, t: any) {
        return ($.dbMemory.getItem(t) as ItemWithAnnotation).annotate;
      },
      async editAnnotation(t: any, i: any, n: any) {
        let o = $.dbMemory.getItem(i) as ItemWithAnnotation;
        if (n.type === "area") {
          o = await capture({ bullet: o, wrap: ifrRef.current, annotation: n, pageNumber: o.annotate.page! }) as any;
        }
        o.annotate = n;
        $.dbMemory.saveItem(o);
        return n;
      },
      async deleteAnnotation(e: any, t: any) {
        $.dbMemory.deleteItem(t, { isRecur: true });
        PDFReader.handleAnnotationBlur();
        return;
      },
    });
  }

  const [mobile, setMobile] = React.useState((visualViewport?.width??Infinity) < 600);

  // listen dialog resize and viewport resize
  React.useEffect(() => {
    const checkMobile = (dialogWidth?: number) => {
      const viewportWidth = visualViewport?.width ?? Infinity;
      // Use actual viewport width if it's small, otherwise use dialog width
      const effectiveWidth = viewportWidth < 600 ? viewportWidth : (dialogWidth ?? viewportWidth);
      return effectiveWidth < 600;
    };

    const onDialogResize = (id: string, size: { width: number; height: number }) => {
      if (id.endsWith(props.node.ky + "-pdfreader")) {
        const viewportWidth = visualViewport?.width ?? Infinity;
        const effectiveWidth = viewportWidth < 600 ? viewportWidth : size.width;
        
        if (wrapperRef.current) {
          wrapperRef.current.style.setProperty('--outer-width', `${effectiveWidth}px`);
        }
        setMobile(checkMobile(size.width));
      }
    };

    const onViewportResize = () => {
      setMobile(checkMobile());
      if (wrapperRef.current) {
        const viewportWidth = visualViewport?.width ?? Infinity;
        if (viewportWidth < 600) {
          wrapperRef.current.style.setProperty('--outer-width', `${viewportWidth}px`);
        }
      }
    };

    pub.on(pub.evt.dialogResized, onDialogResize);
    visualViewport?.addEventListener('resize', onViewportResize);
    onViewportResize(); // Initial check
    
    return () => {
      pub.off(pub.evt.dialogResized, onDialogResize);
      visualViewport?.removeEventListener('resize', onViewportResize);
    }
  }, [props.node.ky]);

  return (
    <div className={`pdfreader-wrap${mobile ? ' pdfreader-mobile' : ''}`} ref={wrapperRef}>
      <div className="pdfreader-mobilebar">
        <input className="left" value="&lt;" type="button" onClick={(e) => { ((ifrRef.current as HTMLIFrameElement)?.contentWindow as any)?.PDFReader?.goLeft(); }} title="Left" />
        <input className="right" type="button" value="&gt;" onClick={(e) => { ((ifrRef.current as HTMLIFrameElement)?.contentWindow as any)?.PDFReader?.goRight(); }} title="Right" />
      </div>
      <ResizablePDFReaderIframe
        ref={resizableContainerRef}
        url={props.url}
        page={props.page}
        node={props.node}
        nodeShow={props.nodeShow}
        ifrRef={ifrRef}
        onLoad={() => { prepared++; if (prepared === 2) initPdfReader(); }}
      />
      <FloatViewerComp item={props.nodeShow.ky} limitZoomInUnderKy={props.node.ky} onItemMounted={(e) => { outlineController = e.container; prepared++; if (prepared === 2) initPdfReader(); }} />
    </div>
  );
}
