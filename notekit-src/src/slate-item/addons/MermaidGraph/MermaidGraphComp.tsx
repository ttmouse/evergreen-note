import React from 'react';
import { mkid } from '../../utils/string/mkid';
import { isEmpty } from '../../utils/isEmpty';
import { loadScript } from '../../utils/dom/loadScript';
import { useAwait } from '../../hooks/useAwait';
import { errorMsgStyle } from '../../components/ErrorMsg/ErrorMsg';
import { cls, colorBase } from '../../styles';
// import mermaid from 'mermaid';

export type MermaidGraphNeededProps = {
  value: string;
};

function trimMarkdown(value: string) {
  return value.replace(/^```mermaid/, '').replace(/```$/, '');
}

export async function mermaidParse(
  id: string,
  content: string,
  el: HTMLElement
) {
  if (isEmpty(content)) {
    return;
  }
  await loadScript('js/mermaid.min.js');
  const { mermaid } = window as any;

  mermaid.initialize({
    startOnLoad: false,
    theme: 'default',
    securityLevel: 'loose',
  })
  const insertSvg = (parsedSvgContent: string) => {
    el.innerHTML = parsedSvgContent;
    const svg = el.querySelector('svg');
    if (svg) {
      const viewBox = svg.getAttribute('viewBox');
      if (viewBox) {
        const [x, y, width, height] = viewBox.split(' ');
        svg.style.height = `${height + 20}px`;
      }
    }
  };
  try {
    mermaid.render(id, trimMarkdown(content), insertSvg);
  } catch (e: any) {
    el.innerHTML = `<div style='height:max-content;overflow: auto;' class='${errorMsgStyle}'>Mermaid syntax error:<br /><pre>${e.str}</pre></div>`;
    console.error(e);
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
  const [id] = React.useState(mkid());
  const { value } = props;
  useAwait(async () => {
    mermaidParse(id, value, ref.current!);
  }, [value]);
  return <div className={mermaidWrapStyle} ref={ref} />;
}
