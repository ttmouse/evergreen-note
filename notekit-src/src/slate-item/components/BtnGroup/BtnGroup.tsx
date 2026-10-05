import React from 'react';
import { AllPartProps, UnitProps } from '../../interfaces/unit';
import { UnitView } from '../UnitView';
import { sty } from '../../styles/atom';
import { LayoutProvider } from '../UnitView/LayoutProvider';

const partProps: Partial<AllPartProps>[] = [
  {
    child: sty`p-3 flex justify-end`,
  },
  {
    node: sty`
      text-white
      select-none
      ml-4
      flex
      grow-0
      items-center
      justify-center
      outline-none
      tracking-wider
      transition-all
      duration-300
      rounded-md
      text-md
      cursor-pointer
      leading-normal
      opacity-100
      focus:outline-none
      focus:shadow-none
      hover:opacity-80
      focus:bg-blue-400
      active:bg-blue-800
      `,
    head: sty`grow items-stretch py-2 px-5`,
  },
];

export const BtnGroup = (props: Partial<UnitProps>) => {
  return (
    <LayoutProvider layoutType="btngroup" layoutProps={partProps}>
      <UnitView
        classOuter="layout-btngroup"
        layout="btngroup"
        layoutDepth={0}
        {...props}
      />
    </LayoutProvider>
  );
};
