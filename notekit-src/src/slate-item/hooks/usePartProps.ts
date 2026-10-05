import React from 'react';
import { ContextLayoutProps } from '../components/UnitView';
import { PartProps, UnitPart } from '../interfaces/unit';
import { isEmpty } from '../utils/isEmpty';

export function usePartProps(
  layoutDepth: number,
  partName: UnitPart
): PartProps {
  const contextProps: any = React.useContext(ContextLayoutProps);
  let partProps: PartProps = {};
  if (typeof layoutDepth === 'number' && !isEmpty(contextProps[layoutDepth])) {
    partProps = contextProps[layoutDepth][partName] ?? {};
    if (typeof partProps === 'string') {
      partProps = { className: partProps };
    }
  }
  return partProps;
}
