import { FormikValues } from 'formik';
import React from 'react';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import { CustomElComp } from './CustomElComp';
import { BaseElProps, FormElProps } from '../Form';
import { getOptions, useChange } from '../helper';
import { appendStyle } from '../../../utils/dom/appendStyle';
import { cls } from '../../../styles';

appendStyle(`
  .MuiToggleButton-root.Mui-selected {
    background-color: #1976d2 !important;
    color: #fff !important;
  }
`);

const circleStyle = cls`
.MuiToggleButtonGroup-grouped {
  border-radius: 100px !important;
  margin-right: 4px !important;
  overflow: hidden;
  width: 20px !important;
  height: 20px !important;
}`;

export type ToggleButtonElProps<V extends FormikValues> = BaseElProps<V> & {
  shape: 'round' | 'square';
  border?: boolean;
};

export const ToggleButtonElComp = (props: ToggleButtonElProps<any>) => {
  const { value, options = {}, multiple, name, shape, size = 'medium', border = false } = props;
  let theValue = value;
  if (multiple && !Array.isArray(value)) {
    theValue = [value];
  }
  const [val, setVal] = React.useState(theValue);
  const onChange = useChange(props);
  const handleChange = (event: React.MouseEvent<HTMLElement>, newVal: any) => {
    let theNewVal = newVal;
    if (multiple) {
      theNewVal = newVal.filter((v: any) => v && v in options);
    }
    setVal(theNewVal);
    onChange(event, theNewVal);
  };
  const styles: string[] = [];
  if (shape === 'round') {
    styles.push(circleStyle);
  }
  if (size === 'small') {
    styles.push(cls`
    .MuiToggleButtonGroup-grouped {
      width: 26px !important;
      height: 26px !important;
    }`);
  }
  if (border) {
    styles.push(cls`
    .MuiToggleButtonGroup-grouped {
      border: 1px solid var(--cl-slate-300) !important;
    }`)
  }

  return (
    <CustomElComp {...props}>
      <ToggleButtonGroup
        value={val}
        exclusive={!multiple}
        onChange={handleChange}
        aria-label={name}
        className={styles.join(' ')}
      >
        {Object.entries(getOptions(options)).map(([v, label]) => {
          return (
            <ToggleButton size="small" value={v} aria-label={label}>
              {label}
            </ToggleButton>
          );
        })}
      </ToggleButtonGroup>
    </CustomElComp>
  );
};
