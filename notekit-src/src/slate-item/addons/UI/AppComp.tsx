import React from 'react';
import { UnitRowNeedChild } from '../../components/Row';
import '../../../assets/normalize.css';
import '../../../assets/index.css';
import '../../../assets/variable.css';

export const AppComp = (props: any) => {
  const { children } = props;
  return (
    <UnitRowNeedChild
      classOuter="app-root-node"
      styleOuter={{ height: '100%' }}
    >
      {children}
    </UnitRowNeedChild>
  );
};
