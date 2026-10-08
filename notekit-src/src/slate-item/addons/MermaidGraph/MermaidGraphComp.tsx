import React from 'react';
import { mkid } from '../../utils/string/mkid';
import { isEmpty } from '../../utils/isEmpty';
import { errorMsgStyle } from '../../components/ErrorMsg/ErrorMsg';
import { cls } from '../../styles';
import { useMermaidTheme } from './useMermaidTheme';

// Let Vite package the engine and its diagram chunks with the offline app.
let mermaidModule: Promise<typeof import('mermaid')> | undefined;

export type MermaidGraphNeededProps = {
  value: string;
  keepLastValid?: boolean;
  onStatus?: (error: string | null) => void;
};

function trimMarkdown(value: string) {
  return value.trim().replace(/^```mermaid\s*\n/, '').replace(/\n```$/, '').trim();
}

export async function mermaidParse(
  id: string,
  content: string,
  el: HTMLElement,
  isCurrent = () => true,
  keepLastValid = false
) {
  if (isEmpty(content)) {
    el.replaceChildren();
    return null;
  }
  try {
    const { default: mermaid } = await (mermaidModule ??= import('mermaid'));
    if (!isCurrent()) return;
    mermaid.initialize({
      startOnLoad: false,
      theme: document.body.classList.contains('night-mode') ? 'dark' : 'default',
      securityLevel: 'loose',
      suppressErrorRendering: true,
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", sans-serif',
    });
    const { svg, bindFunctions } = await mermaid.render(id, trimMarkdown(content));
    if (!isCurrent()) return;
    el.innerHTML = svg;
    const svgElement = el.querySelector('svg');
    if (svgElement) {
      const viewBox = svgElement.getAttribute('viewBox');
      if (viewBox) {
        const [, , width, height] = viewBox.trim().split(/[\s,]+/).map(Number);
        if (width > 0 && height > 0) {
          // The pan/zoom content needs an intrinsic size, not width: 100%.
          svgElement.style.width = `${width}px`;
          svgElement.style.height = `${height}px`;
          svgElement.style.maxWidth = 'none';
        }
      }
    }
    bindFunctions?.(el);
    return null;
  } catch (e: any) {
    if (!isCurrent()) return;
    const message = `Mermaid 渲染失败：\n${e?.message ?? e?.str ?? String(e)}`;
    if (keepLastValid) return message;
    const error = document.createElement('div');
    error.className = errorMsgStyle;
    error.style.whiteSpace = 'pre-wrap';
    error.textContent = message;
    el.replaceChildren(error);
    console.error(e);
    return message;
  }
}

const mermaidWrapStyle = cls`
  svg {
    foreignObject {
      > div {
        display: flex !important;
        align-items: center !important;
        justify-content: center !important;
        height: 100%;
      }
    }
  }
`

export function MermaidGraphComp(props: MermaidGraphNeededProps) {
  const ref = React.useRef<HTMLDivElement>(null);
  const { value, keepLastValid, onStatus } = props;
  const nightMode = useMermaidTheme();
  React.useEffect(() => {
    const el = ref.current!;
    let generation = 0;
    const current = ++generation;
    void mermaidParse(`mermaid-${mkid()}`, value, el, () => current === generation, keepLastValid)
      .then(error => { if (current === generation) onStatus?.(error ?? null); });
    return () => {
      ++generation;
    };
  }, [value, nightMode, keepLastValid, onStatus]);
  return <div className={mermaidWrapStyle} ref={ref} />;
}
