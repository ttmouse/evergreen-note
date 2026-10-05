import React from 'react';
import { cls, colorBase, getColor } from '../../styles';

export const errorMsgStyle = cls`
  border: 1px solid ${getColor(colorBase.danger, 200)};
  padding: 4px 8px;
  border-radius: 4px;
  color: ${[colorBase.danger, 500]};
`;

export function ErrorMsg(props: any) {
  const { children } = props;
  return (
    <div contentEditable={false} className={errorMsgStyle}>
      {children}
    </div>
  );
}
