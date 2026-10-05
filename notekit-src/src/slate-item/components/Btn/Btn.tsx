import React from 'react';
import { UnitProps } from '../../interfaces/unit';
import { PartOuter } from '../UnitView/Parts';
import { PartHead } from '../UnitView/PartHead';
import { PartIcon } from '../UnitView/PartIcon';

const btnPartProps = {
  node: '',
  head: '',
};

export const Btn = (props: Partial<UnitProps>) => {
  return (
    <PartOuter classOuter={btnPartProps.node} {...props}>
      <PartIcon classIcon={btnPartProps.head} {...props} />
      <PartHead {...props} />
    </PartOuter>
  );
};
