import React from 'react';
import { cls, colorBase } from '../../styles';
import { mkid } from '../../utils/string/mkid';
import { SrcProps } from './Embedweb';

const styles = [
  cls`
    width: 100%;
    border: 1px solid var(--cl-slate-200);
    border-radius: 4px;
    overflow: hidden;
    height: 500px;
  `,
  'iframe-comp',
];

export function IframeComp(props: SrcProps) {
  const { value, height, width } = props;

  return (
    <iframe
      className={styles.join(' ')}
      id={mkid()}
      title={mkid()}
      src={value}
      style={{ height, width }}
      frameBorder="no"
      marginWidth={0}
      marginHeight={0}
      sandbox="allow-same-origin allow-scripts"
      allowFullScreen={true}
    />
  );
}
