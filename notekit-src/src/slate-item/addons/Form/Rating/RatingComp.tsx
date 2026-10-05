import React from 'react';
import MuiRating from '@mui/material/Rating';

export type RatingNeededProps = {
  value: number;
  onChange?: (e: React.ChangeEvent) => void;
};

export function RatingComp(props: RatingNeededProps & any) {
  const { value, onChange, ...rest } = props;
  const [val, setVal] = React.useState<number>(value);
  const handleChange = (e: any) => {
    const v = Number((e.target as HTMLInputElement).value);
    setVal(v);
    onChange && onChange(e);
  };

  return (
    <MuiRating
      onChange={handleChange}
      style={{ padding: 0 }}
      value={val}
      {...rest}
    />
  );
}
