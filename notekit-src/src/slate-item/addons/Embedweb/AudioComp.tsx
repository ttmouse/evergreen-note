import React from 'react';
import { mkid } from '../../utils/string/mkid';
import { SrcProps } from './Embedweb';

export function AudioComp(props: SrcProps) {
  let { value } = props;
  let width = '100%';
  let height = 100;
  if (value.includes('music.163.com/outchain/player')) {
    value = value.replace('auto=1', 'auto=0');
  }
  return (
    <audio controls src={value}>
      <track kind="captions" />
    </audio>
  );
}
