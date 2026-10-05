import React from 'react';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import Box from '@mui/material/Box';
import FormControl from '@mui/material/FormControl';
import { FormElProps, Options } from '../Form';
import { FormikValues } from 'formik';
import { getOptions } from '../helper';
import { ContextOnChangeElement } from '../FormContexts';

export type BtnsElProps<V extends FormikValues> = FormElProps<V>;

export function BtnsElComp<V extends FormikValues>(props: BtnsElProps<V>) {
  const { value = 'android', options, name, onElChange, formik } = props;
  const [val, setVal] = React.useState(value);
  const onChangeElement = React.useContext(ContextOnChangeElement);
  const onChange = (event: React.MouseEvent<HTMLElement>, newVal: string) => {
    setVal(newVal);
    formik?.setFieldValue(name!, newVal);
    onElChange?.(event, newVal);
    onChangeElement?.(name!, newVal);
  };

  return (
    <Box>
      <FormControl fullWidth>
        <ToggleButtonGroup
          size="small"
          value={val}
          exclusive
          onChange={onChange}
          aria-label={name}
        >
          {Object.entries(getOptions(options)).map(([k, label]) => (
            <ToggleButton value={k} key={k}>
              {label}
            </ToggleButton>
          ))}
        </ToggleButtonGroup>
      </FormControl>
    </Box>
  );
}
