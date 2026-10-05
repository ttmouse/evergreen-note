/* eslint-disable react/destructuring-assignment */
import React from 'react';
import { getControl } from '../../hooks/useDispatchCache';
import { usePartClassNames } from '../../hooks/usePartClassNames';
import { usePartProps } from '../../hooks/usePartProps';
import { UnitProps } from '../../interfaces/unit';
import { EleIcon } from '../Ele';
import { Icon } from '../../../components/MaterialIcon';

export const PartIcon = (props: Partial<UnitProps>) => {
  const className = usePartClassNames(props, 'icon');
  let { onMouseEnter = function () {} } = usePartProps(
    props.layoutDepth,
    'icon'
  );

  if (typeof props.icon === 'undefined') {
    return null;
  }
  const fn = onMouseEnter;
  onMouseEnter = () => {
    fn({
      props: props as any,
      close(isClose: boolean): void {
        throw new Error('Function not implemented.');
      },
    });
  };
  const onClick = () => {
    if (props.id) {
      getControl(props.id).foldup();
    }
  };
  return (
    <EleIcon
      onMouseEnter={onMouseEnter as any}
      onClick={onClick}
      classIcon={className}
    >
      <Icon
        name={props.icon ?? 'none'}
        size={props.size}
        color={(props as any).color}
      />
    </EleIcon>
  );
};
