import React from 'react';
import { AllPartProps, UnitProps } from '../interfaces/unit';
import { UnitView } from './UnitView';
import { LayoutProvider } from './UnitView/LayoutProvider';

export type UnitLayoutProps = Partial<UnitProps> & {
  layoutType: string;
  layoutProps: Partial<AllPartProps>[];
};

export const UnitLayout = (props: UnitLayoutProps) => {
  const { layoutProps, layoutType } = props;
  return (
    <LayoutProvider layoutType={layoutType} layoutProps={layoutProps}>
      <UnitView
        classOuter={`layout-${layoutType}`}
        layout={layoutType}
        {...props}
      />
    </LayoutProvider>
  );
};
