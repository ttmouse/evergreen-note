import React from 'react';
import { UnitProps, AllPartProps } from '../../interfaces/unit';
import { ContextLayoutProps, ContextLayout } from './UnitViewContexts';

export const LayoutProvider = (
  props: Partial<UnitProps> & {
    layoutProps: Partial<AllPartProps>[];
    layoutType: string;
  }
) => {
  const { layoutProps, layoutType, children } = props;
  return (
    <ContextLayoutProps.Provider value={layoutProps}>
      <ContextLayout.Provider value={layoutType}>
        {children}
      </ContextLayout.Provider>
    </ContextLayoutProps.Provider>
  );
};
