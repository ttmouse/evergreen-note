/* eslint-disable react/destructuring-assignment */
import React from 'react';
import { UnitProps } from '../..';
import { isEmpty } from '../../utils/isEmpty';
import { PartIcon } from './PartIcon';
import { PartHead } from './PartHead';
import { PartBody } from './PartBody';
import { PartOuter, PartExtra, PartFoot } from './Parts';

export const UnitView = (props: Partial<UnitProps>) => {
  const newProps = { ...props };
  if (!isEmpty(newProps.layout)) {
    newProps.layoutContext = null;
    newProps.layoutDepth = 0;
  }

  return (
    <PartOuter {...newProps}>
      <PartIcon size={props.iconSize} {...newProps} />
      <PartExtra {...newProps} />
      <PartHead {...newProps} />
      <PartBody {...newProps} />
      <PartFoot {...newProps} />
    </PartOuter>
  );
};
