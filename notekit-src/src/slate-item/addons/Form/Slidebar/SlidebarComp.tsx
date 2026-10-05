import React from 'react';
import MuiSlider from '@mui/material/Slider';

export type SlidebarNeededProps = {
  value: number;
  onChange?: (e: React.ChangeEvent) => void;
};

export function SlidebarComp(props: SlidebarNeededProps & any) {
  const { value, onChange, ...rest } = props;
  const [val, setVal] = React.useState<number>(value);
  const handleChange = (e: any) => {
    const v = Number((e.target as HTMLInputElement).value);
    setVal(v);
    onChange && onChange(e);
  };

  return <MuiSlider onChange={handleChange} value={val} {...rest} />;
}
