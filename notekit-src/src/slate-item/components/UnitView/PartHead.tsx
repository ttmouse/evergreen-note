import React from 'react';
import { usePartClassNames } from '../../hooks/usePartClassNames';
import { getControl } from '../../hooks/useDispatchCache';
import { UnitProps } from '../../interfaces/unit';
import { EleHead } from '../Ele';

export const PartHead = (props: Partial<UnitProps>) => {
  let className = usePartClassNames(props, 'head');
  const attrs: any = {};
  const { title } = props;

  // e.g. backlink panels: clicking anywhere on the title toggles foldup
  if ((props as any).clickHeadToFold && props.id) {
    attrs.onClick = () => {
      getControl(props.id!).foldup();
    };
    className = `${className} head-click-to-fold`;
  }

  return (
    <EleHead classHead={className} {...attrs}>
      {title}
    </EleHead>
  );
};
