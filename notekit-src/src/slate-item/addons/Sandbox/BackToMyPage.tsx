import React from 'react';
import { $t } from '../../../i18n';
import { cls, colorBase } from '../../styles';
import { ROUTE_KEY } from '../Router/Router';

const style = cls`
  background-color: ${[colorBase.orange, 500]};
  color: #fff;
  border-radius: 4px;
  padding: 2px 4px;
`;

export function BackToMyPage() {
  const link = `/${ROUTE_KEY}/?db=default`;
  return <a className={style} href={link}>{$t`sandbox.back`}</a>;
}