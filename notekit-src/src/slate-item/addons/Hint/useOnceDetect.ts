import React from 'react';

/**
 * 确保在一个 item 内，同一个关键词只提示一次双向链接
 * @param leaf
 * @param ref 
 */
export function useOnceDetect(leaf: any, ref: React.RefObject<HTMLElement>) {
  React.useEffect(() => {
    if (
      leaf.hint &&
      ref.current
        ?.closest('.node-text')
        ?.querySelector(`[data-hint="${leaf.text}"]`) !== ref.current
    ) {
      ref.current?.classList.remove('mark-hint');
    }
  });
}
