import React from 'react';
import { useItem } from '../../../hooks/useItem';
import { Item } from '../../../interfaces/item';

export function BodyWithHelperTitle({ children }: any) {
  const item = useItem();
  const title = Item.headString(item);
  return item.layout !== 'flexmap' ? (
    children
  ) : (
    <>
      <div className="flexmap-helper-title">{title}</div>
      {children}
    </>
  );
}
