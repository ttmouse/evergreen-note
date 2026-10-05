import React from 'react';
import { App } from '../../engine/App';
import { cls } from '../../styles';
import { mkid } from '../../utils/string/mkid';
import { until } from '../../utils/until';
import { createDOMElement } from '../../utils/dom/createDOMElement';
import { useAwait } from '../../hooks/useAwait';
import Alert from '@mui/material/Alert';
import { $t } from '../../../i18n';
import { FloatViewerComp } from '../FloatViewer/FloatEditorComp';
import { browser } from '@/slate-item/utils/browser';

export type PDFReaderIframeComp = {
  url: string;
  page: number;
  node: UnitPersist;
  nodeShow: UnitPersist;
  onLoad: () => void;
};

const iframeStyle = cls`
  width: 100%;
  height: 100%;
`;

export const PDFReaderIframeComp = React.forwardRef(
  (props: PDFReaderIframeComp, ref) => {
    const appRef = React.useRef<App | null>(null);
    const ifrRef = React.useRef<HTMLIFrameElement | null>(null);

    const onLoad = async (e: React.SyntheticEvent) => {
      const iframe = e.target as HTMLIFrameElement;
      await until(() => (iframe.contentWindow as any).PDFReader);
      ifrRef.current = iframe;
      const PDFReader = appRef.current = (iframe.contentWindow as any).PDFReader!;
      props.onLoad();
      PDFReader.open(props.url, props.page, {
        isMobile: browser.isMobile,
        width: visualViewport?.width||0,
      }, props.node.ky!==props.nodeShow.ky ? props.nodeShow.ky : null);
    };

    const src = "/v2/pdfreader/";

    return (
      <div className="PDFReaderIframe" style={{height: '100%', overflowY:"hidden"}}>
        <iframe
          ref={ref as any}
          onLoad={onLoad}
          className={iframeStyle}
          src={src}
          title={mkid()}
        />
      </div>
    );
  }
);
