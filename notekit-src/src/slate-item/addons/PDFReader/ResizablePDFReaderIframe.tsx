import React from 'react';
import { ResizableBox } from 'react-resizable';
import { PDFReaderIframeComp } from './PDFReaderIframeComp';
import { browser } from '@/slate-item/utils/browser';
import { pub } from '@/slate-item/utils/pub';

interface ResizablePDFReaderIframeProps {
    url: string;
    page: number;
    node: UnitPersist;
    nodeShow: UnitPersist;
    onLoad: () => void;
    ifrRef: React.RefObject<HTMLElement>;
    initialWidth?: number;
}

export const ResizablePDFReaderIframe = React.memo(
    React.forwardRef<HTMLDivElement, ResizablePDFReaderIframeProps>((props, ref) => {
        const { url, page, node, nodeShow, onLoad, ifrRef, initialWidth = visualViewport!.width * 0.6 } = props;
        const [boxWidth, setBoxWidth] = React.useState(initialWidth);
        const [maxWidth, setMaxWidth] = React.useState(visualViewport!.width - 250);

        // Listen to dialog resize and viewport resize events
        React.useEffect(() => {
            const updateWidths = (dialogWidth: number) => {
                const viewportWidth = visualViewport?.width ?? Infinity;
                // Use viewport width if it's small, ignore stored JS widths
                const effectiveWidth = viewportWidth < 600 ? viewportWidth : dialogWidth;
                
                if (effectiveWidth < 600) {
                    setBoxWidth(effectiveWidth);
                    setMaxWidth(effectiveWidth);
                } else {
                    const newMaxWidth = effectiveWidth - 250;
                    setMaxWidth(newMaxWidth);
                    setBoxWidth(prev => Math.min(prev, newMaxWidth));
                }
            };

            const onDialogResize = (id: string, size: { width: number; height: number }) => {
                if (id.endsWith(node.ky + "-pdfreader")) {
                    updateWidths(size.width);
                }
            };

            const onViewportResize = () => {
                const viewportWidth = visualViewport?.width ?? Infinity;
                if (viewportWidth < 600) {
                    setBoxWidth(viewportWidth);
                    setMaxWidth(viewportWidth);
                }
            };

            pub.on(pub.evt.dialogResized, onDialogResize);
            visualViewport?.addEventListener('resize', onViewportResize);
            onViewportResize(); // Initial check
            
            return () => {
                pub.off(pub.evt.dialogResized, onDialogResize);
                visualViewport?.removeEventListener('resize', onViewportResize);
            };
        }, [node.ky]);

        return (
            <div ref={ref} className="pdfreader-resizable-container">
                <ResizableBox
                    width={boxWidth}
                    height={999999}
                    maxConstraints={[maxWidth, Infinity]}
                    handle={
                        <div className={`pdfreader-resize-handler${browser.isMobile ? ' mobile' : ''}`} />
                    }
                    onResizeStart={() => {
                        ifrRef.current && (ifrRef.current.style.pointerEvents = "none");
                    }}
                    onResizeStop={(e, data) => {
                        ifrRef.current && (ifrRef.current.style.pointerEvents = "all");
                        setBoxWidth(data.size.width);
                    }}
                    onResize={(e, data) => {
                        setBoxWidth(data.size.width);
                    }}
                >
                    <div className="pdfreader-iframe-outer">
                        <PDFReaderIframeComp
                            url={url}
                            page={page}
                            node={node}
                            nodeShow={nodeShow}
                            ref={ifrRef}
                            onLoad={onLoad}
                        />
                    </div>
                </ResizableBox>
            </div>
        );
    })
);

ResizablePDFReaderIframe.displayName = 'ResizablePDFReaderIframe';
