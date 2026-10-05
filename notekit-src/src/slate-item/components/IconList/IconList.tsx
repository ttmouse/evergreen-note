import React from 'react';
import { Icon } from '../../../components/MaterialIcon';
import { AllPartProps, UnitMode, UnitProps } from '../../interfaces/unit';
import { PriEle } from '../Ele';
import { IconItem } from '../IconItem';
import { ContextUnitMode } from '../UnitView';

import { cls } from '../../styles';
import { PartOuter } from '../UnitView/Parts';

const partProps: Partial<AllPartProps>[] = [
  {
    child: cls`
      display: flex;
      align-items: center;
    `,
  },
];

export const PartIconForIconList = (props: Partial<UnitProps>) => {
  const { icon, onClick, size, title } = props;
  const mode = React.useContext(ContextUnitMode);
  if (typeof icon === 'undefined') {
    return null;
  }

  const attrs: any = {};
  if (typeof onClick === 'function' && mode === UnitMode.ClickFirst) {
    attrs.onClick = props.onClick;
  }
  return (
    <PriEle data-part="icon" title={title as any} {...attrs} {...props}>
      <Icon name={icon ?? 'none'} size={size} />
    </PriEle>
  );
};

export const IconList = React.forwardRef((props: Partial<UnitProps>, ref) => {
  const newProps = { ...props };
  const { body } = newProps;
  return (
    <PartOuter {...newProps} ref={ref}>
      <PriEle data-part="child" classChild={partProps[0].child as string}>
        {(body as UnitProps[]).map((child: UnitProps, index: number) => (
          <IconItem key={index} {...child} />
        ))}
      </PriEle>
    </PartOuter>
  );
});
