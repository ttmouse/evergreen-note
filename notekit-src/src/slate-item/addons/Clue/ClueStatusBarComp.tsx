import React from 'react';
import { observer } from 'mobx-react';
import { useAddons } from '../../hooks/useAddons';
import { isEmpty } from '../../utils/isEmpty';

export type ClueStatusBarProps = {};

export const ClueStatusBarComp = observer((props: ClueStatusBarProps) => {
  const $ = useAddons();
  const { store } = $.clue;

  if (isEmpty(store)) {
    return null;
  }

  const content: string[] = [];
  for (const [key, value] of Object.entries(store)) {
    content.push(`${key}:${value}`);
  }

  return (
    <div className="ClueStatusBar">
      {content.join(' ').replace('type:', '')}
    </div>
  );
});
