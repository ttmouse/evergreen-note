/* eslint-disable react/destructuring-assignment */
import React from 'react';
import * as Factory from '..';
import { usePartClassNames } from '../../hooks/usePartClassNames';
import { UnitProps } from '../../interfaces/unit';
import { isEmpty } from '../../utils/isEmpty';
import { EleBody, EleSubitems } from '../Ele';
import { ContextLayout } from './UnitViewContexts';
import { mkid } from '../../utils/string/mkid';

export const PartBody = (props: Partial<UnitProps>) => {
  const children: any =
    typeof props.body === 'string' ? [{ title: props.body }] : props.body;
  const bodyClassName = usePartClassNames(props, 'body');
  const childClassName = usePartClassNames(props, 'child');
  const ctx = React.useContext(ContextLayout);
  if (isEmpty(props.body) || props.recursive === false) {
    return null;
  }
  return (
    <EleBody classBody={bodyClassName}>
      <EleSubitems classChild={childClassName}>
        {children.map((subProps: Partial<UnitProps>) => {
          if (typeof props.layoutDepth === 'number') {
            subProps.layoutDepth = Number(props.layoutDepth) + 1;
            subProps.layoutContext = ctx;
          }

          const View = subProps.unitType
            ? (Factory as any)[subProps.unitType]
            : Factory.UnitView;
          return <View {...subProps} key={mkid()} />;
          // return <UnitView { ...subProps } key={getUniqueId()} />
        })}
      </EleSubitems>
    </EleBody>
  );
};
