import React from 'react';
import { PopoverSubitems, setSubVisible } from '../IconItem/IconItem';
import Chip from '@mui/material/Chip';
import { CaretDownIcon as KeyboardArrowDownIcon } from '@phosphor-icons/react';
import { UnitProps } from '../../interfaces/unit';
import { mkid } from '../../utils/string/mkid';

export type DropdownProps = {
  subitems: UnitProps[];
  name?: string;
  onSelect?: (v: any, params: { setLabel(v: any): void }) => void;
  onChange?: (v: any, params: { setLabel(v: any): void }) => void;
  value?: any;
  title?: string;
  filterable?: boolean;
  className?: string;
};

export function DropdownComp(props: DropdownProps) {
  const {
    name = mkid(),
    onSelect,
    onChange,
    title,
    filterable,
    subitems,
    value,
    className = '',
    ...rest
  } = props;

  const [label, setLabel] = React.useState(
    value ?? title ?? subitems[0].title ?? ''
  );

  const comp = (params: any) => (
    <Chip
      label={String(label)}
      variant="outlined"
      size="small"
      color="default"
      deleteIcon={<KeyboardArrowDownIcon />}
      onDelete={params.onClick}
      className={className}
      {...params}
    />
  );

  const list = Object.values(subitems).map((item) => ({
    ...item,
    onClick: () => {
      setLabel(item.value ?? item.title);
      onChange?.(item, { setLabel });
      onSelect?.(item, { setLabel });
    },
  }));

  const handleSelect = (v: any) => {
    setLabel(v.item.title);
    onSelect?.(v.item, { setLabel });
    onChange?.(v.item, { setLabel });
  };

  setSubVisible(name, false);

  return (
    <PopoverSubitems
      onSelect={handleSelect}
      id={name}
      name={name}
      TriggerComp={comp}
      subitems={list as any}
      filterable={filterable}
      {...rest}
    />
  );
}
